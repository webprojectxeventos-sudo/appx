-- ============================================================
-- Migration V2: New features
-- 1. Real polls/surveys system
-- 2. Event schedule/timeline
-- 3. Collaborative playlist
-- 4. Multi-event support (user_events pivot)
-- 5. Push notification subscriptions
-- 6. Event location coordinates (for map)
-- ============================================================

-- ============================================================
-- 1. REAL POLLS / SURVEYS (reuse existing polls tables but add type)
-- ============================================================

-- Add poll_type to distinguish drink orders from real surveys
ALTER TABLE polls ADD COLUMN IF NOT EXISTS poll_type TEXT NOT NULL DEFAULT 'survey'
  CHECK (poll_type IN ('survey', 'drink_order'));

-- Add allow_multiple to let users select multiple options
ALTER TABLE polls ADD COLUMN IF NOT EXISTS allow_multiple BOOLEAN NOT NULL DEFAULT false;

-- Add ends_at for timed polls
ALTER TABLE polls ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- ============================================================
-- 2. EVENT SCHEDULE / TIMELINE
-- ============================================================

CREATE TABLE IF NOT EXISTS event_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  icon TEXT DEFAULT 'clock', -- lucide icon name
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE event_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view event schedule"
  ON event_schedule FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage event schedule"
  ON event_schedule FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_event_schedule_event ON event_schedule(event_id, start_time);

-- ============================================================
-- 3. COLLABORATIVE PLAYLIST
-- ============================================================

CREATE TABLE IF NOT EXISTS playlist_songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  spotify_url TEXT,
  added_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID NOT NULL REFERENCES playlist_songs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(song_id, user_id)
);

ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view playlist songs"
  ON playlist_songs FOR SELECT USING (true);

CREATE POLICY "Authenticated users can add songs"
  ON playlist_songs FOR INSERT
  WITH CHECK (auth.uid() = added_by);

CREATE POLICY "Admins can delete songs"
  ON playlist_songs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
    OR auth.uid() = added_by
  );

CREATE POLICY "Anyone can view votes"
  ON playlist_votes FOR SELECT USING (true);

CREATE POLICY "Users can vote"
  ON playlist_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own vote"
  ON playlist_votes FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_playlist_songs_event ON playlist_songs(event_id);
CREATE INDEX IF NOT EXISTS idx_playlist_votes_song ON playlist_votes(song_id);

-- ============================================================
-- 4. MULTI-EVENT SUPPORT
-- ============================================================

CREATE TABLE IF NOT EXISTS user_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'attendee' CHECK (role IN ('attendee', 'admin', 'scanner')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, event_id)
);

ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event memberships"
  ON user_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all memberships for their events"
  ON user_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can join events"
  ON user_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage memberships"
  ON user_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_event ON user_events(event_id);

-- ============================================================
-- 5. PUSH NOTIFICATION SUBSCRIPTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ============================================================
-- 6. EVENT LOCATION COORDINATES (for map)
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
