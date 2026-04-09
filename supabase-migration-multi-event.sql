-- ============================================
-- MIGRATION: Multi-event users + Promoter role
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add 'promoter' to role constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner', 'super_admin', 'group_admin', 'promoter'));

ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_role_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner', 'super_admin', 'group_admin', 'promoter'));

-- 2. Add 'added_by' to user_events (tracks who assigned the user)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES auth.users(id);

-- 3. Add 'image_url' to venues (from previous feature)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 4. Function: check if email already exists in auth.users
CREATE OR REPLACE FUNCTION public.check_existing_user(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(TRIM(p_email));
  IF v_user_id IS NOT NULL THEN
    RETURN json_build_object('exists', true);
  END IF;
  RETURN json_build_object('exists', false);
END;
$$;

-- Grant execute to authenticated and anon (needed for registration check)
GRANT EXECUTE ON FUNCTION public.check_existing_user(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_existing_user(TEXT) TO authenticated;

-- 5. Function: assign user to event (for promoters/admins)
CREATE OR REPLACE FUNCTION public.assign_user_to_event(
  p_user_id UUID,
  p_event_id UUID,
  p_added_by UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event_exists BOOLEAN;
  v_user_exists BOOLEAN;
BEGIN
  -- Verify event exists
  SELECT EXISTS(SELECT 1 FROM events WHERE id = p_event_id) INTO v_event_exists;
  IF NOT v_event_exists THEN
    RETURN json_build_object('success', false, 'error', 'Evento no encontrado');
  END IF;

  -- Verify user exists
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id) INTO v_user_exists;
  IF NOT v_user_exists THEN
    RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  -- Upsert into user_events
  INSERT INTO user_events (user_id, event_id, role, is_active, added_by)
  VALUES (p_user_id, p_event_id, 'attendee', true, p_added_by)
  ON CONFLICT (user_id, event_id)
  DO UPDATE SET is_active = true, added_by = COALESCE(EXCLUDED.added_by, user_events.added_by);

  -- Switch user's active event
  UPDATE users SET event_id = p_event_id WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_to_event(UUID, UUID, UUID) TO authenticated;

-- 6. RLS: Allow promoters to read users in their organization
-- (They already can via existing org-based policies, but verify)
-- No changes needed if existing policies check organization_id match.

-- Done!
