-- ============================================================
-- Migration V3: Multi-group architecture
-- 1. Organizations (TuGraduacionMadrid = 1 org)
-- 2. Venues (shared locations)
-- 3. Events updated with org_id, venue_id, group_name
-- 4. Role hierarchy: super_admin, group_admin, scanner, attendee
-- 5. Incidents system
-- 6. Activate user_events as primary membership table
-- ============================================================

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view organizations"
  ON organizations FOR SELECT USING (true);

CREATE POLICY "Super admins can manage organizations"
  ON organizations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
    OR created_by = auth.uid()
  );

-- ============================================================
-- 2. VENUES
-- ============================================================

CREATE TABLE IF NOT EXISTS venues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view venues"
  ON venues FOR SELECT USING (true);

CREATE POLICY "Org admins can manage venues"
  ON venues FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(organization_id);

-- ============================================================
-- 3. UPDATE EVENTS — add org, venue, group_name
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS group_name TEXT; -- e.g. "IES Cervantes 4ºA"

CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id);

-- ============================================================
-- 4. UPDATE ROLE ENUM — add super_admin, group_admin
-- ============================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner', 'super_admin', 'group_admin'));

-- Also update user_events role constraint
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_role_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner', 'super_admin', 'group_admin'));

-- Add organization_id to users for org-level membership
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- ============================================================
-- 5. INCIDENTS SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('medical', 'security', 'logistics', 'other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view incidents for their events"
  ON incidents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'group_admin', 'scanner')
    )
  );

CREATE POLICY "Staff can create incidents"
  ON incidents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'group_admin', 'scanner')
    )
  );

CREATE POLICY "Admins can update incidents"
  ON incidents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'group_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_incidents_event ON incidents(event_id);
CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

-- ============================================================
-- 6. MESSAGE TEMPLATES (for centralized comms)
-- ============================================================

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view templates"
  ON message_templates FOR SELECT USING (true);

CREATE POLICY "Admins can manage templates"
  ON message_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 7. BROADCAST LOG (track which announcements sent where)
-- ============================================================

CREATE TABLE IF NOT EXISTS broadcast_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  event_ids UUID[] NOT NULL, -- which events received this broadcast
  content TEXT NOT NULL,
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE broadcast_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view broadcast log"
  ON broadcast_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'group_admin')
    )
  );

CREATE POLICY "Admins can create broadcasts"
  ON broadcast_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- 8. HELPER: Get events visible to a user
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_visible_events(p_user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  -- Super admins see all events in their org
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role = 'super_admin') THEN
    RETURN QUERY
      SELECT e.id FROM events e
      JOIN users u ON u.id = p_user_id
      WHERE e.organization_id = u.organization_id;
    RETURN;
  END IF;

  -- Other roles see events they're assigned to
  RETURN QUERY
    SELECT ue.event_id FROM user_events ue
    WHERE ue.user_id = p_user_id AND ue.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
