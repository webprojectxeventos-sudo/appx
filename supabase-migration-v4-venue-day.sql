-- ============================================================================
-- MIGRATION V4: Venue+Day model — Photos & Chat venue-scoped
-- ============================================================================
-- CONTEXTO: 1 dia puede tener 3 discotecas (venues), cada una con ~10
--   institutos (events). Las fotos son por venue (compartidas entre todos
--   los institutos de esa discoteca). El chat tiene modo privado (por instituto)
--   + modo general (por venue).
--
-- CAMBIOS:
--   1. photos: venue_id + photo_date, event_id nullable
--   2. messages: venue_id + is_general, event_id nullable
--   3. RLS policies actualizadas para venue-scoped access
--   4. Helper function: rls_is_venue_member
-- ============================================================================
-- ⚠️  REVISAR ANTES DE EJECUTAR. NO ejecutar en produccion sin backup.
-- ============================================================================


-- ============================================================================
-- SECTION 1: SCHEMA CHANGES
-- ============================================================================

-- 1A. Photos → venue-scoped
ALTER TABLE photos ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS photo_date DATE;
ALTER TABLE photos ALTER COLUMN event_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photos_venue_date ON photos(venue_id, photo_date);
CREATE INDEX IF NOT EXISTS idx_photos_venue_id ON photos(venue_id);

-- 1B. Messages → dual mode (privado + general)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_general BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ALTER COLUMN event_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_venue_general ON messages(venue_id) WHERE is_general = true;
CREATE INDEX IF NOT EXISTS idx_messages_venue_id ON messages(venue_id);


-- ============================================================================
-- SECTION 2: BACKFILL EXISTING DATA
-- ============================================================================

-- Photos: populate venue_id and photo_date from their event
UPDATE photos
SET venue_id = e.venue_id,
    photo_date = (e.date AT TIME ZONE 'Europe/Madrid')::date
FROM events e
WHERE photos.event_id = e.id
  AND photos.venue_id IS NULL
  AND e.venue_id IS NOT NULL;

-- Messages: existing messages are all private (event-scoped), ensure is_general=false
UPDATE messages
SET is_general = false
WHERE is_general IS NULL;


-- ============================================================================
-- SECTION 3: HELPER FUNCTION — venue membership check
-- ============================================================================

-- Returns true if auth.uid() belongs to ANY event at the given venue
CREATE OR REPLACE FUNCTION public.rls_is_venue_member(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM user_events ue
      JOIN events e ON e.id = ue.event_id
      WHERE ue.user_id = auth.uid()
        AND ue.is_active = true
        AND e.venue_id = p_venue_id
    )
    OR EXISTS (
      SELECT 1
      FROM users u
      JOIN venues v ON v.organization_id = u.organization_id
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
        AND v.id = p_venue_id
    );
$$;

-- Returns true if auth.uid() is admin of any event at the given venue
CREATE OR REPLACE FUNCTION public.rls_is_venue_admin(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM user_events ue
      JOIN events e ON e.id = ue.event_id
      WHERE ue.user_id = auth.uid()
        AND ue.is_active = true
        AND e.venue_id = p_venue_id
        AND ue.role IN ('admin', 'super_admin', 'group_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM users u
      JOIN venues v ON v.organization_id = u.organization_id
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
        AND v.id = p_venue_id
    );
$$;


-- ============================================================================
-- SECTION 4: RLS POLICIES — PHOTOS (venue-scoped)
-- ============================================================================

-- Drop old policies from rls-fix migration
DROP POLICY IF EXISTS "Event members can view photos" ON public.photos;
DROP POLICY IF EXISTS "Event admins can insert photos" ON public.photos;
DROP POLICY IF EXISTS "Event admins can delete photos" ON public.photos;
-- Drop any legacy policies
DROP POLICY IF EXISTS "Users in event can view photos" ON public.photos;
DROP POLICY IF EXISTS "Admins can insert photos" ON public.photos;
DROP POLICY IF EXISTS "Admins can delete photos" ON public.photos;

-- SELECT: venue member can see venue photos, event member can see legacy event photos
CREATE POLICY "Members can view photos"
  ON public.photos FOR SELECT
  USING (
    -- Venue-scoped photos: user belongs to any event at that venue
    (venue_id IS NOT NULL AND rls_is_venue_member(venue_id))
    OR
    -- Legacy event-scoped photos (venue_id NULL): user is event member
    (venue_id IS NULL AND event_id IS NOT NULL AND rls_is_event_member(event_id))
  );

-- INSERT: venue admin can upload venue photos, event admin can upload event photos
CREATE POLICY "Admins can insert photos"
  ON public.photos FOR INSERT
  WITH CHECK (
    (venue_id IS NOT NULL AND rls_is_venue_admin(venue_id))
    OR
    (event_id IS NOT NULL AND rls_is_event_admin(event_id))
  );

-- DELETE: venue admin can delete venue photos, event admin can delete event photos
CREATE POLICY "Admins can delete photos"
  ON public.photos FOR DELETE
  USING (
    (venue_id IS NOT NULL AND rls_is_venue_admin(venue_id))
    OR
    (event_id IS NOT NULL AND rls_is_event_admin(event_id))
  );


-- ============================================================================
-- SECTION 5: RLS POLICIES — MESSAGES (dual mode)
-- ============================================================================

-- Drop old policies from rls-fix migration
DROP POLICY IF EXISTS "Event members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Event members can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Event admins can delete messages" ON public.messages;
-- Drop any legacy policies
DROP POLICY IF EXISTS "Users in event can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users in event can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Only admins can delete messages" ON public.messages;

-- SELECT: private messages via event membership, general via venue membership
CREATE POLICY "Members can view messages"
  ON public.messages FOR SELECT
  USING (
    -- Private event chat
    (is_general = false AND event_id IS NOT NULL AND rls_is_event_member(event_id))
    OR
    -- General venue chat
    (is_general = true AND venue_id IS NOT NULL AND rls_is_venue_member(venue_id))
  );

-- INSERT: check user owns the message + membership
CREATE POLICY "Members can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Private: user must be event member
      (is_general = false AND event_id IS NOT NULL AND rls_is_event_member(event_id))
      OR
      -- General: user must be venue member
      (is_general = true AND venue_id IS NOT NULL AND rls_is_venue_member(venue_id))
    )
  );

-- DELETE: admin of event or venue
CREATE POLICY "Admins can delete messages"
  ON public.messages FOR DELETE
  USING (
    (is_general = false AND event_id IS NOT NULL AND rls_is_event_admin(event_id))
    OR
    (is_general = true AND venue_id IS NOT NULL AND rls_is_venue_admin(venue_id))
  );


-- ============================================================================
-- SECTION 6: MESSAGE_REACTIONS — update policy for venue messages
-- ============================================================================

-- Reactions policy needs to handle venue-scoped messages too
-- The existing policy checks via message ownership; we need to check the parent message
DROP POLICY IF EXISTS "Event members can view reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can view reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.message_reactions;

CREATE POLICY "Members can view reactions"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_reactions.message_id
        AND (
          (m.is_general = false AND m.event_id IS NOT NULL AND rls_is_event_member(m.event_id))
          OR
          (m.is_general = true AND m.venue_id IS NOT NULL AND rls_is_venue_member(m.venue_id))
        )
    )
  );

-- INSERT reaction: user can react if they can see the message
DROP POLICY IF EXISTS "Event members can react" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can react" ON public.message_reactions;
DROP POLICY IF EXISTS "Authenticated users can react" ON public.message_reactions;

CREATE POLICY "Members can react"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_reactions.message_id
        AND (
          (m.is_general = false AND m.event_id IS NOT NULL AND rls_is_event_member(m.event_id))
          OR
          (m.is_general = true AND m.venue_id IS NOT NULL AND rls_is_venue_member(m.venue_id))
        )
    )
  );

-- DELETE reaction: only own reactions
DROP POLICY IF EXISTS "Users can remove own reaction" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.message_reactions;

CREATE POLICY "Users can remove own reactions"
  ON public.message_reactions FOR DELETE
  USING (user_id = auth.uid());


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Schema: photos (+venue_id, +photo_date, event_id nullable)
--         messages (+venue_id, +is_general, event_id nullable)
-- Functions: rls_is_venue_member, rls_is_venue_admin (2 new)
-- Policies: 3 photos (replaced), 3 messages (replaced), 3 reactions (replaced)
-- Backfill: photos get venue_id from event, messages get is_general=false
-- Total: 6 policies dropped + 6 created on photos/messages
--        3 policies dropped + 3 created on message_reactions
