-- Migration: Chat moderation hardening
-- Run this in Supabase SQL Editor
--
-- Adds three primitives used by the hardened chat pipeline:
--   1. events.chat_enabled          — per-event kill-switch
--   2. users.full_name_locked       — prevents rename-to-insult abuse
--   3. users.profanity_strikes      — server-side strike tracker
--   4. users.last_strike_at         — strike-window timestamp
--
-- Client-side writes to full_name / full_name_locked / profanity_strikes /
-- last_strike_at are blocked via REVOKE UPDATE — all writes must go through
-- /api/user/save-profile or /api/chat/send (which use the service role).

-- 1. Kill-switch per event (default ON — chat stays on unless admin flips it)
ALTER TABLE events ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN DEFAULT true;

-- 2. Name lock — flipped to true by /api/user/save-profile after first valid save
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name_locked BOOLEAN DEFAULT false;

-- 3. Profanity strike tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS profanity_strikes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_strike_at TIMESTAMPTZ;

-- Index so the kill-switch lookup in /api/chat/send stays O(1) when disabled
CREATE INDEX IF NOT EXISTS idx_events_chat_disabled
  ON events(id)
  WHERE chat_enabled = false;

-- Revoke column-level UPDATE from authenticated role. The service role still
-- has full access (used by /api/user/save-profile and /api/chat/send).
-- This is the defense against an attacker opening F12 and calling
--   supabase.from('users').update({ full_name: 'insulto' })
-- directly from the browser.
REVOKE UPDATE (full_name, full_name_locked, profanity_strikes, last_strike_at)
  ON public.users FROM authenticated;

-- Same for anon role (belt and braces — anon shouldn't be updating users at all)
REVOKE UPDATE (full_name, full_name_locked, profanity_strikes, last_strike_at)
  ON public.users FROM anon;

-- Force all non-announcement chat messages through /api/chat/send.
--
-- Without this, a bored kid can open F12 and call:
--   supabase.from('messages').insert({ content: 'gilipollas', ... })
-- directly, bypassing every filter the route enforces.
--
-- Service role bypasses RLS, so /api/chat/send (which creates a client with the
-- service role key) keeps working. Admin / promoter broadcasts continue to work
-- because is_announcement = true satisfies this policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'Non-announcement inserts must use service role'
  ) THEN
    CREATE POLICY "Non-announcement inserts must use service role" ON messages
      AS RESTRICTIVE FOR INSERT
      WITH CHECK (is_announcement = true);
  END IF;
END $$;
