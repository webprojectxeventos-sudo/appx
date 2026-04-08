-- ============================================================================
-- Project X: TuGraduacionMadrid - Graduation Events App
-- Supabase Schema
-- ============================================================================
-- Run this in the Supabase SQL Editor to create the full schema.
-- Tables are ordered to respect foreign key dependencies.
-- ============================================================================

-- ============================================================================
-- 1. TABLE: events (created FIRST because users references it)
-- ============================================================================
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  date timestamptz NOT NULL,
  location text,
  cover_image_url text,
  event_code text UNIQUE NOT NULL CHECK (LENGTH(event_code) = 6),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.events IS 'Graduation events. Each event has a unique 6-character code for attendees to join.';

-- ============================================================================
-- 2. TABLE: users (references events)
-- ============================================================================
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'attendee' CHECK (role IN ('attendee', 'admin')),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.users IS 'User profiles extending auth.users. Each user can be an attendee or admin.';

-- ============================================================================
-- 3. TABLE: photos (references events)
-- ============================================================================
CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.photos IS 'Photos associated with events. URLs point to Dropbox storage.';

-- ============================================================================
-- 4. TABLE: messages (references events and auth.users)
-- ============================================================================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  is_announcement boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Chat messages and announcements. Realtime enabled.';

-- ============================================================================
-- 5. TABLE: polls (references events)
-- ============================================================================
CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  question text NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.polls IS 'Polls/surveys for event attendees.';

-- ============================================================================
-- 6. TABLE: poll_options (references polls)
-- ============================================================================
CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. TABLE: poll_votes (references polls, poll_options, auth.users)
-- ============================================================================
CREATE TABLE public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  poll_option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

-- ============================================================================
-- 8. TABLE: access_codes (códigos individuales anti-fraude)
-- ============================================================================
CREATE TABLE public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  label text,
  is_active boolean DEFAULT true,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.access_codes IS 'Códigos de acceso individuales. Cada código solo se puede usar UNA vez.';

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_users_event_id ON public.users(event_id);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_events_event_code ON public.events(event_code);
CREATE INDEX idx_events_created_by ON public.events(created_by);
CREATE INDEX idx_photos_event_id ON public.photos(event_id);
CREATE INDEX idx_messages_event_id ON public.messages(event_id);
CREATE INDEX idx_messages_user_id ON public.messages(user_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_polls_event_id ON public.polls(event_id);
CREATE INDEX idx_poll_options_poll_id ON public.poll_options(poll_id);
CREATE INDEX idx_poll_votes_poll_id ON public.poll_votes(poll_id);
CREATE INDEX idx_poll_votes_user_id ON public.poll_votes(user_id);
CREATE INDEX idx_poll_votes_poll_option_id ON public.poll_votes(poll_option_id);
CREATE INDEX idx_access_codes_event_id ON public.access_codes(event_id);
CREATE INDEX idx_access_codes_code ON public.access_codes(code);
CREATE INDEX idx_access_codes_used_by ON public.access_codes(used_by);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- ── USERS ───────────────────────────────────────────────────────────────────
-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Anyone authenticated can insert their own profile (needed for registration)
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any user
CREATE POLICY "Admins can update any user"
  ON public.users FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── EVENTS ──────────────────────────────────────────────────────────────────
-- Authenticated users can view all events
CREATE POLICY "Authenticated users can view events"
  ON public.events FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can create events
CREATE POLICY "Only admins can create events"
  ON public.events FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can update events
CREATE POLICY "Only admins can update events"
  ON public.events FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can delete events
CREATE POLICY "Only admins can delete events"
  ON public.events FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── PHOTOS ──────────────────────────────────────────────────────────────────
-- Users in the event can view photos
CREATE POLICY "Users in event can view photos"
  ON public.photos FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND event_id = photos.event_id)
  );

-- Admins can insert photos
CREATE POLICY "Admins can insert photos"
  ON public.photos FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can delete photos
CREATE POLICY "Admins can delete photos"
  ON public.photos FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── MESSAGES ────────────────────────────────────────────────────────────────
-- Users in the event can view messages
CREATE POLICY "Users in event can view messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND event_id = messages.event_id)
  );

-- Users in the event can insert their own messages
CREATE POLICY "Users in event can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND event_id = messages.event_id)
  );

-- Admins can delete messages
CREATE POLICY "Only admins can delete messages"
  ON public.messages FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── POLLS ───────────────────────────────────────────────────────────────────
-- Users in the event can view polls
CREATE POLICY "Users in event can view polls"
  ON public.polls FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND event_id = polls.event_id)
  );

-- Only admins can create polls
CREATE POLICY "Only admins can create polls"
  ON public.polls FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can update polls
CREATE POLICY "Only admins can update polls"
  ON public.polls FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── POLL_OPTIONS ────────────────────────────────────────────────────────────
-- Authenticated users can view poll options
CREATE POLICY "Authenticated users can view poll options"
  ON public.poll_options FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can manage poll options
CREATE POLICY "Only admins can insert poll options"
  ON public.poll_options FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Only admins can delete poll options"
  ON public.poll_options FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── POLL_VOTES ──────────────────────────────────────────────────────────────
-- Authenticated users can view votes
CREATE POLICY "Authenticated users can view poll votes"
  ON public.poll_votes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert their own vote (one per poll enforced by UNIQUE constraint)
CREATE POLICY "Users can insert their own vote"
  ON public.poll_votes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
