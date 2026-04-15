-- Migration: Lost & Found table for the /lost-found attendee page
-- Run this in Supabase SQL Editor.
--
-- The feature was shipped in the app (app/(app)/lost-found/page.tsx) but the
-- corresponding table was never created, so all .from('lost_found') calls
-- silently failed with PGRST205. This migration creates the table and wires
-- up RLS matching the existing event-membership model.

CREATE TABLE IF NOT EXISTS lost_found (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  location_hint TEXT,
  contact_info TEXT,
  status TEXT NOT NULL DEFAULT 'lost' CHECK (status IN ('lost', 'found')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lost_found_event ON lost_found(event_id);
CREATE INDEX IF NOT EXISTS idx_lost_found_user ON lost_found(user_id);
CREATE INDEX IF NOT EXISTS idx_lost_found_status ON lost_found(status);

ALTER TABLE lost_found ENABLE ROW LEVEL SECURITY;

-- Members of the event can read all lost_found items for that event
CREATE POLICY "Event members can read lost_found"
  ON lost_found
  FOR SELECT
  USING (rls_is_event_member(event_id));

-- Members of the event can create lost_found items (only for themselves)
CREATE POLICY "Event members can insert own lost_found"
  ON lost_found
  FOR INSERT
  WITH CHECK (
    rls_is_event_member(event_id)
    AND user_id = auth.uid()
  );

-- Users can update only their own items (e.g. toggle lost <-> found)
CREATE POLICY "Users can update own lost_found"
  ON lost_found
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete only their own items
CREATE POLICY "Users can delete own lost_found"
  ON lost_found
  FOR DELETE
  USING (user_id = auth.uid());

-- Event admins / staff can moderate (delete / update) any row for their event
CREATE POLICY "Event staff can moderate lost_found"
  ON lost_found
  FOR ALL
  USING (rls_is_event_staff(event_id))
  WITH CHECK (rls_is_event_staff(event_id));

-- Realtime subscription (the page uses `postgres_changes`)
ALTER PUBLICATION supabase_realtime ADD TABLE lost_found;
