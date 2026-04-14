-- Migration: Chat bans table + message soft-delete columns
-- Run this in Supabase SQL Editor

-- 1. Chat bans table (timed or permanent bans per event)
CREATE TABLE IF NOT EXISTS chat_bans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  banned_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  banned_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,  -- NULL = permanent ban
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, event_id)
);

-- RLS for chat_bans
ALTER TABLE chat_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read bans" ON chat_bans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'admin', 'group_admin')
    )
  );

CREATE POLICY "Staff can insert bans" ON chat_bans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'admin', 'group_admin')
    )
  );

CREATE POLICY "Staff can update bans" ON chat_bans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('super_admin', 'admin', 'group_admin')
    )
  );

-- Users can check their own bans (needed for chat enforcement)
CREATE POLICY "Users can read own bans" ON chat_bans
  FOR SELECT USING (user_id = auth.uid());

-- 2. Soft-delete columns for messages (audit trail)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Index for efficient ban lookups
CREATE INDEX IF NOT EXISTS idx_chat_bans_user_event ON chat_bans(user_id, event_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at) WHERE deleted_at IS NOT NULL;
