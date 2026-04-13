-- ============================================================================
-- MIGRATION: Fix handle_new_user to set organization_id from event
-- ============================================================================
-- PROBLEMA: El trigger handle_new_user no asigna organization_id a los nuevos
--           usuarios, lo que hace que sean invisibles para los admins via RLS
--           (la policy "Org admins can view org users" compara organization_id).
--
-- SOLUCION: Derivar organization_id del evento al que se registra el usuario.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_event_id UUID;
  v_role TEXT;
  v_org_id UUID;
BEGIN
  v_event_id := (NEW.raw_user_meta_data->>'event_id')::uuid;
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'attendee');

  -- Derivar organization_id del evento (o del metadata si se pasa directamente)
  IF NEW.raw_user_meta_data->>'organization_id' IS NOT NULL THEN
    v_org_id := (NEW.raw_user_meta_data->>'organization_id')::uuid;
  ELSIF v_event_id IS NOT NULL THEN
    SELECT e.organization_id INTO v_org_id
    FROM public.events e
    WHERE e.id = v_event_id;
  END IF;

  -- Crear perfil de usuario
  INSERT INTO public.users (id, email, full_name, role, event_id, gender, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    v_role,
    v_event_id,
    NEW.raw_user_meta_data->>'gender',
    v_org_id
  );

  -- Crear membership en user_events para que las policies funcionen
  IF v_event_id IS NOT NULL THEN
    INSERT INTO public.user_events (user_id, event_id, role, is_active)
    VALUES (NEW.id, v_event_id, v_role, true)
    ON CONFLICT (user_id, event_id) DO NOTHING;
  END IF;

  -- Reclamar codigo de acceso si se proporciono
  IF NEW.raw_user_meta_data->>'access_code' IS NOT NULL THEN
    UPDATE public.access_codes
    SET used_by = NEW.id, used_at = now()
    WHERE code = UPPER(REPLACE(NEW.raw_user_meta_data->>'access_code', '-', ''))
      AND is_active = true
      AND used_by IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
