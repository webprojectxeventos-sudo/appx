-- ============================================================================
-- MIGRATION: redeem_access_code()
-- ============================================================================
-- Problema:
--   El flujo en /events (handleJoin) llamaba a validate_access_code (solo
--   lectura) + INSERT en user_events desde el cliente. No reclamaba el codigo,
--   asi que el mismo codigo podia usarlo N usuarios distintos; y aun cuando
--   se insertaba la membresia, no se generaba ticket ni se mandaba email, asi
--   que el usuario no veia QR.
--
-- Solucion:
--   RPC atomica que, en una sola transaccion:
--     1. Hace SELECT ... FOR UPDATE del codigo para serializar canjes
--        concurrentes (dos personas con el mismo codigo -> solo uno gana).
--     2. Valida (existe + activo + no usado o usado por el propio caller).
--     3. Marca used_by + used_at.
--     4. UPSERT en user_events (activando is_active por si estaba inactiva).
--     5. Devuelve event_id + event_title + event_date para que el cliente
--        pueda invocar generate_ticket + /api/send-ticket despues.
--
-- Idempotente:
--   Si un usuario re-introduce un codigo que ya canjeo el mismo, devuelve
--   ok=true con already_redeemed=true (asegura que la membresia este activa,
--   no la duplica). Si lo canjeo otra persona, rechaza con code_already_used.
--
-- Compatibilidad:
--   - NO se modifica validate_access_code ni handle_new_user: el signup
--     inicial en /register sigue funcionando igual (el trigger es el que
--     reclama el codigo en ese flujo). Este cambio solo afecta al canje
--     posterior desde /events para usuarios ya autenticados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_access_code(code_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_clean_code  text;
  v_code_id     uuid;
  v_event_id    uuid;
  v_used_by     uuid;
  v_is_active   boolean;
  v_event_title text;
  v_event_date  timestamptz;
  v_already     boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_clean_code := UPPER(REPLACE(COALESCE(code_text, ''), '-', ''));
  IF length(v_clean_code) <> 8 THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- Lock row for the duration of the tx. Dos canjes concurrentes del mismo
  -- codigo se serializan: el segundo ve used_by IS NOT NULL y rebota.
  SELECT ac.id, ac.event_id, ac.used_by, ac.is_active
    INTO v_code_id, v_event_id, v_used_by, v_is_active
  FROM public.access_codes ac
  WHERE ac.code = v_clean_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF NOT v_is_active THEN
    RETURN json_build_object('ok', false, 'error', 'code_disabled');
  END IF;

  IF v_used_by IS NOT NULL THEN
    IF v_used_by = v_uid THEN
      -- Mismo usuario re-introduce su propio codigo: idempotente.
      v_already := true;
    ELSE
      RETURN json_build_object('ok', false, 'error', 'code_already_used');
    END IF;
  END IF;

  -- Reclamar codigo (solo si aun no esta reclamado por nadie).
  IF NOT v_already THEN
    UPDATE public.access_codes
       SET used_by = v_uid,
           used_at = now()
     WHERE id = v_code_id;
  END IF;

  -- Asegurar membresia. UPSERT: si ya existia (reactivar), no duplica.
  INSERT INTO public.user_events (user_id, event_id, role, is_active)
  VALUES (v_uid, v_event_id, 'attendee', true)
  ON CONFLICT (user_id, event_id)
  DO UPDATE SET is_active = true;

  -- Metadata del evento para que el cliente tenga todo lo que necesita
  -- sin una segunda round-trip.
  SELECT e.title, e.date
    INTO v_event_title, v_event_date
  FROM public.events e
  WHERE e.id = v_event_id;

  RETURN json_build_object(
    'ok', true,
    'already_redeemed', v_already,
    'event_id', v_event_id,
    'event_title', v_event_title,
    'event_date', v_event_date
  );
END;
$$;

COMMENT ON FUNCTION public.redeem_access_code(text) IS
  'Canjea un access_code para el usuario autenticado: marca used_by, '
  'crea/activa user_events. Atomica (FOR UPDATE). Idempotente para el '
  'propietario. No toca el flujo de /register (handle_new_user sigue '
  'reclamando el codigo en signups nuevos).';

-- Permisos: solo usuarios autenticados.
REVOKE ALL ON FUNCTION public.redeem_access_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_access_code(text) TO authenticated;
