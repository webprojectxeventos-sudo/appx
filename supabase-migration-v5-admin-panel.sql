-- ============================================================
-- Migration V5: Admin Panel Upgrade
-- Adds: message pinning, user muting, playlist moderation
-- Run in Supabase SQL Editor
-- ============================================================

-- ─── 1. Messages: Pin support ─────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(event_id) WHERE is_pinned = true;

-- ─── 2. User Events: Mute support ────────────────────────
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. Playlist Songs: Moderation status ─────────────────
ALTER TABLE playlist_songs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_playlist_status ON playlist_songs(event_id, status);

-- ─── 4. RLS: Admins can pin/unpin messages ────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Admins can update messages'
  ) THEN
    CREATE POLICY "Admins can update messages" ON messages
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;

-- ─── 5. RLS: Admins can mute users in events ─────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_events' AND policyname = 'Admins can update user_events'
  ) THEN
    CREATE POLICY "Admins can update user_events" ON user_events
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;

-- ─── 6. RLS: Admins can update playlist songs status ──────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'playlist_songs' AND policyname = 'Admins can update playlist_songs'
  ) THEN
    CREATE POLICY "Admins can update playlist_songs" ON playlist_songs
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;

-- ─── 7. RLS: Admins can delete messages ───────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Admins can delete messages'
  ) THEN
    CREATE POLICY "Admins can delete messages" ON messages
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;

-- ─── 8. RLS: Admins can delete playlist songs ─────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'playlist_songs' AND policyname = 'Admins can delete playlist_songs'
  ) THEN
    CREATE POLICY "Admins can delete playlist_songs" ON playlist_songs
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;
