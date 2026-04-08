-- ============================================================================
-- MIGRATION: RLS Security Fix — Membership-based access control
-- ============================================================================
-- PROBLEMA: Todas las policies usan users.role sin filtrar por evento/org.
--           Un admin de evento A tiene acceso total a evento B.
--           Ninguna policy usa user_events para validar membership.
--           4 RPCs SECURITY DEFINER sin validacion de rol (cualquier user las explota).
--
-- SOLUCION: Helper functions SECURITY DEFINER + policies basadas en user_events.
--           Super admins acceden via users.organization_id = events.organization_id.
--
-- ORDEN: 0) Prerequisites → 1) RPCs → 2) SELECT cross-event → 3) Admin policies
-- ============================================================================
-- ⚠️  REVISAR ANTES DE EJECUTAR. NO ejecutar en produccion sin backup.
-- ============================================================================


-- ============================================================================
-- SECTION 0A: SCHEMA DEPENDENCIES (from v2-features + v3-multigroup)
-- ============================================================================
-- These CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS are idempotent.
-- If you already ran v2/v3 migrations, they are no-ops.

-- Organizations table (v3-multigroup)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view organizations" ON organizations;
CREATE POLICY "Anyone can view organizations"
  ON organizations FOR SELECT USING (true);

-- Venues table (v3-multigroup)
CREATE TABLE IF NOT EXISTS venues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Add org/venue columns to events (v3-multigroup)
ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS group_name TEXT;
CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id);

-- Add organization_id to users (v3-multigroup)
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Update role constraint on users to allow v3 roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner', 'super_admin', 'group_admin'));

-- user_events table (v2-features)
CREATE TABLE IF NOT EXISTS user_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'attendee',
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, event_id)
);
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Ensure role constraint allows all needed roles
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_role_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_role_check
  CHECK (role IN ('attendee', 'admin', 'scanner', 'super_admin', 'group_admin'));

-- Base policy: users can see their own memberships
DROP POLICY IF EXISTS "Users can view own event memberships" ON user_events;
CREATE POLICY "Users can view own event memberships"
  ON user_events FOR SELECT
  USING (auth.uid() = user_id);

-- Incidents table (v3-multigroup)
CREATE TABLE IF NOT EXISTS incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('medical', 'security', 'logistics', 'other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_incidents_event ON incidents(event_id);
CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

-- Message templates (v3-multigroup)
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Broadcast log (v3-multigroup)
CREATE TABLE IF NOT EXISTS broadcast_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  event_ids UUID[] NOT NULL,
  content TEXT NOT NULL,
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE broadcast_log ENABLE ROW LEVEL SECURITY;

-- v2 features: polls columns
ALTER TABLE polls ADD COLUMN IF NOT EXISTS poll_type TEXT NOT NULL DEFAULT 'survey';
ALTER TABLE polls ADD COLUMN IF NOT EXISTS allow_multiple BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- v2 features: event schedule
CREATE TABLE IF NOT EXISTS event_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  icon TEXT DEFAULT 'clock',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE event_schedule ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_event_schedule_event ON event_schedule(event_id, start_time);

-- v2 features: collaborative playlist
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
CREATE INDEX IF NOT EXISTS idx_playlist_songs_event ON playlist_songs(event_id);
CREATE INDEX IF NOT EXISTS idx_playlist_votes_song ON playlist_votes(song_id);

CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(organization_id);

-- ============================================================================
-- SECTION 0B: PREREQUISITES — Indexes + Helper Functions + Trigger + Backfill
-- ============================================================================

-- Indices compuestos para acelerar todas las membership checks
CREATE INDEX IF NOT EXISTS idx_user_events_membership
  ON user_events(user_id, event_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_events_membership_role
  ON user_events(user_id, event_id, is_active, role);

CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users(id, organization_id, role);

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: ¿El usuario es miembro del evento? (via user_events O super_admin de la org)
-- SECURITY DEFINER para evitar dependencias circulares de RLS
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_is_event_member(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_events
      WHERE user_id = auth.uid()
        AND event_id = p_event_id
        AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM users u
      JOIN events e ON e.organization_id = u.organization_id
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
        AND e.id = p_event_id
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: ¿El usuario es admin del evento? (admin/super_admin/group_admin en user_events
--         O super_admin de la org)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_is_event_admin(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_events
      WHERE user_id = auth.uid()
        AND event_id = p_event_id
        AND is_active = true
        AND role IN ('admin', 'super_admin', 'group_admin')
    )
    OR EXISTS (
      SELECT 1 FROM users u
      JOIN events e ON e.organization_id = u.organization_id
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
        AND e.id = p_event_id
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: ¿El usuario es staff del evento? (scanner/admin/group_admin/super_admin)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_is_event_staff(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_events
      WHERE user_id = auth.uid()
        AND event_id = p_event_id
        AND is_active = true
        AND role IN ('admin', 'super_admin', 'group_admin', 'scanner')
    )
    OR EXISTS (
      SELECT 1 FROM users u
      JOIN events e ON e.organization_id = u.organization_id
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
        AND e.id = p_event_id
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: ¿El usuario es admin de la organizacion?
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND organization_id = p_org_id
      AND role IN ('admin', 'super_admin')
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: ¿El usuario pertenece a la organizacion?
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND organization_id = p_org_id
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICO: handle_new_user debe crear row en user_events.
-- Sin esto, los nuevos registros no tendrian membership y las nuevas
-- policies les bloquearian el acceso a todo.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_event_id UUID;
  v_role TEXT;
BEGIN
  v_event_id := (NEW.raw_user_meta_data->>'event_id')::uuid;
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'attendee');

  -- Crear perfil de usuario
  INSERT INTO public.users (id, email, full_name, role, event_id, gender)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    v_role,
    v_event_id,
    NEW.raw_user_meta_data->>'gender'
  );

  -- NUEVO: Crear membership en user_events para que las policies funcionen
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

-- Recrear trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- BACKFILL: Crear filas en user_events para usuarios existentes que solo
-- tienen users.event_id pero no tienen row en user_events.
-- Ejecutar UNA VEZ tras aplicar esta migracion.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO user_events (user_id, event_id, role, is_active)
SELECT u.id, u.event_id, u.role, true
FROM users u
WHERE u.event_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_events ue
    WHERE ue.user_id = u.id AND ue.event_id = u.event_id
  )
ON CONFLICT (user_id, event_id) DO NOTHING;


-- ============================================================================
-- BLOQUE 1: RPCs CRITICAS
-- ============================================================================
-- Cualquier attendee puede llamar estas funciones porque son SECURITY DEFINER
-- sin validacion de rol. Prioridad maxima.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1a. scan_ticket() — ANTES: cualquiera podia escanear tickets
--     AHORA: solo staff (scanner/admin/group_admin/super_admin) del evento
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION scan_ticket(ticket_qr TEXT)
RETURNS JSON AS $$
DECLARE
  v_ticket tickets%ROWTYPE;
  v_user users%ROWTYPE;
  v_event events%ROWTYPE;
  v_scanner_id UUID;
BEGIN
  v_scanner_id := auth.uid();

  -- Buscar el ticket
  SELECT * INTO v_ticket FROM tickets WHERE qr_code = ticket_qr;

  IF v_ticket IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ticket no encontrado');
  END IF;

  -- NUEVO: Validar que el caller es staff del evento del ticket
  IF NOT rls_is_event_staff(v_ticket.event_id) THEN
    RAISE EXCEPTION 'No tienes permiso para escanear tickets de este evento';
  END IF;

  -- Comprobar si ya fue usado
  IF v_ticket.status = 'used' THEN
    RETURN json_build_object('success', false, 'error', 'Ticket ya escaneado', 'scanned_at', v_ticket.scanned_at);
  END IF;

  -- Comprobar si esta cancelado
  IF v_ticket.status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Ticket cancelado');
  END IF;

  -- Obtener info del usuario y evento
  SELECT * INTO v_user FROM users WHERE id = v_ticket.user_id;
  SELECT * INTO v_event FROM events WHERE id = v_ticket.event_id;

  -- Marcar como usado
  UPDATE tickets
  SET status = 'used', scanned_at = now(), scanned_by = v_scanner_id
  WHERE id = v_ticket.id;

  RETURN json_build_object(
    'success', true,
    'user_name', v_user.full_name,
    'user_email', v_user.email,
    'event_title', v_event.title,
    'ticket_id', v_ticket.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 1b. generate_ticket() — ANTES: cualquiera podia generar tickets para otros
--     AHORA: solo el propio usuario O un admin del evento
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_ticket(p_user_id UUID, p_event_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_qr TEXT;
  v_existing TEXT;
BEGIN
  -- NUEVO: Validar que el caller es el propio usuario O admin del evento
  IF auth.uid() != p_user_id AND NOT rls_is_event_admin(p_event_id) THEN
    RAISE EXCEPTION 'No tienes permiso para generar tickets en este evento';
  END IF;

  -- Comprobar si ya existe ticket
  SELECT qr_code INTO v_existing FROM tickets
  WHERE user_id = p_user_id AND event_id = p_event_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Generar QR unico: PX-{event_id_short}-{random}
  v_qr := 'PX-' || substring(p_event_id::text, 1, 8) || '-' ||
           encode(gen_random_bytes(12), 'hex');

  INSERT INTO tickets (user_id, event_id, qr_code)
  VALUES (p_user_id, p_event_id, v_qr);

  RETURN v_qr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 1c. generate_access_codes() — ANTES: cualquiera podia generar codigos
--     AHORA: solo admin del evento target
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_access_codes(
  target_event_id uuid,
  quantity integer,
  code_label text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  i integer := 0;
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  inserted integer := 0;
BEGIN
  -- NUEVO: Validar que el caller es admin del evento
  IF NOT rls_is_event_admin(target_event_id) THEN
    RAISE EXCEPTION 'No tienes permiso para generar codigos en este evento';
  END IF;

  WHILE inserted < quantity LOOP
    new_code := '';
    FOR j IN 1..8 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.access_codes (event_id, code, label)
      VALUES (target_event_id, new_code, code_label);
      inserted := inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    i := i + 1;
    IF i > quantity * 10 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN inserted;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1d. get_user_visible_events() — ANTES: cualquiera podia consultar eventos de otro user
--     AHORA: solo el propio usuario puede llamarla
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_visible_events(p_user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  -- NUEVO: Validar que el caller es el propio usuario
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para consultar eventos de otro usuario';
  END IF;

  -- Super admins ven todos los eventos de su org
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role = 'super_admin') THEN
    RETURN QUERY
      SELECT e.id FROM events e
      JOIN users u ON u.id = p_user_id
      WHERE e.organization_id = u.organization_id;
    RETURN;
  END IF;

  -- Otros roles ven eventos de user_events
  RETURN QUERY
    SELECT ue.event_id FROM user_events ue
    WHERE ue.user_id = p_user_id AND ue.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- BLOQUE 2: SELECT cross-event (attendees ven datos de otros eventos)
-- ============================================================================
-- Cada bloque: DROP policy vieja → CREATE policy nueva con membership check.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EVENTS                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Cualquier usuario autenticado ve TODOS los eventos
-- AHORA: Solo miembros del evento (via user_events) o super_admin de la org
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.events;

CREATE POLICY "Members can view their events"
  ON public.events FOR SELECT
  USING (rls_is_event_member(id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ POLL_OPTIONS                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: auth.role() = 'authenticated' — cualquier user ve opciones de TODOS los eventos
-- AHORA: Miembro del evento de la poll padre
DROP POLICY IF EXISTS "Authenticated users can view poll options" ON public.poll_options;

CREATE POLICY "Event members can view poll options"
  ON public.poll_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM polls p
      WHERE p.id = poll_options.poll_id
        AND rls_is_event_member(p.event_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ POLL_VOTES                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: auth.role() = 'authenticated' — cualquier user ve votos de TODOS los eventos
-- AHORA: Miembro del evento de la poll padre
DROP POLICY IF EXISTS "Authenticated users can view poll votes" ON public.poll_votes;

CREATE POLICY "Event members can view poll votes"
  ON public.poll_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM polls p
      WHERE p.id = poll_votes.poll_id
        AND rls_is_event_member(p.event_id)
    )
  );

-- ANTES: solo user_id = auth.uid() sin check de membership
-- AHORA: Propio usuario + miembro del evento
DROP POLICY IF EXISTS "Users can insert their own vote" ON public.poll_votes;

CREATE POLICY "Event members can insert own vote"
  ON public.poll_votes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM polls p
      WHERE p.id = poll_votes.poll_id
        AND rls_is_event_member(p.event_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EVENT_SCHEDULE                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: USING (true) — publico sin autenticacion
-- AHORA: Miembro del evento
DROP POLICY IF EXISTS "Anyone can view event schedule" ON event_schedule;

CREATE POLICY "Event members can view schedule"
  ON event_schedule FOR SELECT
  USING (rls_is_event_member(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PLAYLIST_SONGS                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: USING (true) — publico sin autenticacion
-- AHORA: Miembro del evento
DROP POLICY IF EXISTS "Anyone can view playlist songs" ON playlist_songs;

CREATE POLICY "Event members can view playlist songs"
  ON playlist_songs FOR SELECT
  USING (rls_is_event_member(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PLAYLIST_VOTES                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: USING (true) — publico sin autenticacion
-- AHORA: Miembro del evento (via playlist_songs padre)
DROP POLICY IF EXISTS "Anyone can view votes" ON playlist_votes;

CREATE POLICY "Event members can view playlist votes"
  ON playlist_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM playlist_songs ps
      WHERE ps.id = playlist_votes.song_id
        AND rls_is_event_member(ps.event_id)
    )
  );

-- ANTES: auth.uid() = user_id sin check de membership
-- AHORA: Propio usuario + miembro del evento
DROP POLICY IF EXISTS "Users can vote" ON playlist_votes;

CREATE POLICY "Event members can vote on songs"
  ON playlist_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM playlist_songs ps
      WHERE ps.id = playlist_votes.song_id
        AND rls_is_event_member(ps.event_id)
    )
  );

-- DELETE propio: correcto pero sin membership — ahora no puede ver votos de otros eventos
DROP POLICY IF EXISTS "Users can remove own vote" ON playlist_votes;

CREATE POLICY "Members can remove own vote"
  ON playlist_votes FOR DELETE
  USING (auth.uid() = user_id);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MESSAGE_REACTIONS                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: auth.role() = 'authenticated' — cualquier user ve reacciones de TODOS los eventos
-- AHORA: Miembro del evento del mensaje padre
DROP POLICY IF EXISTS "Users can view reactions" ON public.message_reactions;

CREATE POLICY "Event members can view reactions"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_reactions.message_id
        AND rls_is_event_member(m.event_id)
    )
  );

-- ANTES: solo user_id = auth.uid() sin check de membership
-- AHORA: Propio usuario + miembro del evento
DROP POLICY IF EXISTS "Users can insert own reaction" ON public.message_reactions;

CREATE POLICY "Event members can insert own reaction"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_reactions.message_id
        AND rls_is_event_member(m.event_id)
    )
  );

-- ANTES: user_id = auth.uid() sin membership check
-- AHORA: Propio usuario + miembro del evento
DROP POLICY IF EXISTS "Users can delete own reaction" ON public.message_reactions;

CREATE POLICY "Event members can delete own reaction"
  ON public.message_reactions FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_reactions.message_id
        AND rls_is_event_member(m.event_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ INCIDENTS                                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Staff global sin filtro por evento/org
-- AHORA: Staff del evento O admin de la org (para ver incidents cross-event dentro de su org)
DROP POLICY IF EXISTS "Staff can view incidents for their events" ON incidents;

CREATE POLICY "Event staff can view incidents"
  ON incidents FOR SELECT
  USING (
    rls_is_event_staff(event_id)
    OR (organization_id IS NOT NULL AND rls_is_org_admin(organization_id))
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ORGANIZATIONS                                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: USING (true) — cualquier anonimo ve todas las organizaciones
-- AHORA: Solo miembros de la org (users.organization_id = id)
DROP POLICY IF EXISTS "Anyone can view organizations" ON organizations;

CREATE POLICY "Org members can view own organization"
  ON organizations FOR SELECT
  USING (rls_is_org_member(id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VENUES                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: USING (true) — publico
-- AHORA: Solo miembros de la org
DROP POLICY IF EXISTS "Anyone can view venues" ON venues;

CREATE POLICY "Org members can view venues"
  ON venues FOR SELECT
  USING (rls_is_org_member(organization_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MESSAGE_TEMPLATES                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: USING (true) — publico
-- AHORA: Solo miembros de la org
DROP POLICY IF EXISTS "Org members can view templates" ON message_templates;

CREATE POLICY "Org members can view own templates"
  ON message_templates FOR SELECT
  USING (rls_is_org_member(organization_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ BROADCAST_LOG                                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Admin/group_admin global sin filtro por org
-- AHORA: Admin de la org
DROP POLICY IF EXISTS "Admins can view broadcast log" ON broadcast_log;

CREATE POLICY "Org admins can view broadcast log"
  ON broadcast_log FOR SELECT
  USING (rls_is_org_admin(organization_id));


-- ============================================================================
-- BLOQUE 3: ADMIN policies (admin de evento A tiene acceso a evento B)
-- ============================================================================
-- Para cada tabla: DROP policy vieja con role = 'admin' global,
-- CREATE nueva que valida membership por evento o por org.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ USERS                                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT propio: se mantiene (auth.uid() = id) — NO TOCAR
-- INSERT propio: se mantiene (auth.uid() = id) — NO TOCAR
-- UPDATE propio: se mantiene (auth.uid() = id) — NO TOCAR

-- Helper: returns the caller's (role, organization_id) bypassing RLS
-- Needed because policies on `users` cannot query `users` directly (infinite recursion)
CREATE OR REPLACE FUNCTION public.rls_get_caller_org()
RETURNS TABLE(caller_role TEXT, caller_org_id UUID)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT role, organization_id
  FROM users
  WHERE id = auth.uid();
$$;

-- ANTES: role = 'admin' — cualquier admin ve TODOS los usuarios
-- AHORA: Admin/super_admin ve solo usuarios de su misma organizacion
-- NOTA: Usa SECURITY DEFINER helper para evitar recursion infinita
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

CREATE POLICY "Org admins can view org users"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rls_get_caller_org() c
      WHERE c.caller_role IN ('admin', 'super_admin')
        AND c.caller_org_id IS NOT NULL
        AND c.caller_org_id = users.organization_id
    )
  );

-- ANTES: role = 'admin' — cualquier admin actualizaba cualquier usuario
-- AHORA: Admin/super_admin solo en su organizacion
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;

CREATE POLICY "Org admins can update org users"
  ON public.users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rls_get_caller_org() c
      WHERE c.caller_role IN ('admin', 'super_admin')
        AND c.caller_org_id IS NOT NULL
        AND c.caller_org_id = users.organization_id
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EVENTS                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: role = 'admin' sin filtro — admin de evento A podia crear evento en org B
-- AHORA: Admin/super_admin de la misma organizacion
DROP POLICY IF EXISTS "Only admins can create events" ON public.events;

CREATE POLICY "Org admins can create events"
  ON public.events FOR INSERT
  WITH CHECK (rls_is_org_admin(organization_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento especifico (via user_events) o super_admin de la org
DROP POLICY IF EXISTS "Only admins can update events" ON public.events;

CREATE POLICY "Event admins can update events"
  ON public.events FOR UPDATE
  USING (rls_is_event_admin(id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento o super_admin de la org
DROP POLICY IF EXISTS "Only admins can delete events" ON public.events;

CREATE POLICY "Event admins can delete events"
  ON public.events FOR DELETE
  USING (rls_is_event_admin(id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHOTOS                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Usaba users.event_id (solo evento activo, no multi-event)
-- AHORA: Miembro del evento via user_events
DROP POLICY IF EXISTS "Users in event can view photos" ON public.photos;

CREATE POLICY "Event members can view photos"
  ON public.photos FOR SELECT
  USING (rls_is_event_member(event_id));

-- ANTES: role = 'admin' global — admin de evento A podia subir fotos a evento B
-- AHORA: Admin del evento especifico
DROP POLICY IF EXISTS "Admins can insert photos" ON public.photos;

CREATE POLICY "Event admins can insert photos"
  ON public.photos FOR INSERT
  WITH CHECK (rls_is_event_admin(event_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento especifico
DROP POLICY IF EXISTS "Admins can delete photos" ON public.photos;

CREATE POLICY "Event admins can delete photos"
  ON public.photos FOR DELETE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MESSAGES                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Usaba users.event_id (solo evento activo)
-- AHORA: Miembro del evento via user_events
DROP POLICY IF EXISTS "Users in event can view messages" ON public.messages;

CREATE POLICY "Event members can view messages"
  ON public.messages FOR SELECT
  USING (rls_is_event_member(event_id));

-- ANTES: Usaba users.event_id para check de membership
-- AHORA: Miembro del evento + solo sus propios mensajes
DROP POLICY IF EXISTS "Users in event can insert messages" ON public.messages;

CREATE POLICY "Event members can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND rls_is_event_member(event_id)
  );

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento especifico
DROP POLICY IF EXISTS "Only admins can delete messages" ON public.messages;

CREATE POLICY "Event admins can delete messages"
  ON public.messages FOR DELETE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ POLLS                                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Usaba users.event_id
-- AHORA: Miembro del evento via user_events
DROP POLICY IF EXISTS "Users in event can view polls" ON public.polls;

CREATE POLICY "Event members can view polls"
  ON public.polls FOR SELECT
  USING (rls_is_event_member(event_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento
DROP POLICY IF EXISTS "Only admins can create polls" ON public.polls;

CREATE POLICY "Event admins can create polls"
  ON public.polls FOR INSERT
  WITH CHECK (rls_is_event_admin(event_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento
DROP POLICY IF EXISTS "Only admins can update polls" ON public.polls;

CREATE POLICY "Event admins can update polls"
  ON public.polls FOR UPDATE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ POLL_OPTIONS (admin policies)                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento de la poll padre
DROP POLICY IF EXISTS "Only admins can insert poll options" ON public.poll_options;

CREATE POLICY "Event admins can insert poll options"
  ON public.poll_options FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM polls p
      WHERE p.id = poll_options.poll_id
        AND rls_is_event_admin(p.event_id)
    )
  );

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento de la poll padre
DROP POLICY IF EXISTS "Only admins can delete poll options" ON public.poll_options;

CREATE POLICY "Event admins can delete poll options"
  ON public.poll_options FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM polls p
      WHERE p.id = poll_options.poll_id
        AND rls_is_event_admin(p.event_id)
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DRINK_ORDERS                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT propio: se mantiene (user_id = auth.uid()) — NO TOCAR
-- UPDATE propio: se mantiene (user_id = auth.uid()) — NO TOCAR

-- ANTES: role = 'admin' global — admin de evento A veia pedidos de evento B
-- AHORA: Admin del evento especifico
DROP POLICY IF EXISTS "Admins can view all drink orders" ON public.drink_orders;

CREATE POLICY "Event admins can view drink orders"
  ON public.drink_orders FOR SELECT
  USING (rls_is_event_admin(event_id));

-- ANTES: Usaba users.event_id para membership check
-- AHORA: Propio usuario + miembro del evento via user_events
DROP POLICY IF EXISTS "Users can insert own drink order" ON public.drink_orders;

CREATE POLICY "Event members can insert own drink order"
  ON public.drink_orders FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND rls_is_event_member(event_id)
  );

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento
DROP POLICY IF EXISTS "Admins can delete drink orders" ON public.drink_orders;

CREATE POLICY "Event admins can delete drink orders"
  ON public.drink_orders FOR DELETE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ACCESS_CODES                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT propio (used_by = auth.uid()): se mantiene — NO TOCAR

-- ANTES: role = 'admin' global — admin de evento A veia codigos de evento B
-- AHORA: Admin del evento al que pertenece el codigo
DROP POLICY IF EXISTS "Admins can view all access codes" ON public.access_codes;

CREATE POLICY "Event admins can view access codes"
  ON public.access_codes FOR SELECT
  USING (rls_is_event_admin(event_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento
DROP POLICY IF EXISTS "Admins can insert access codes" ON public.access_codes;

CREATE POLICY "Event admins can insert access codes"
  ON public.access_codes FOR INSERT
  WITH CHECK (rls_is_event_admin(event_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento
DROP POLICY IF EXISTS "Admins can update access codes" ON public.access_codes;

CREATE POLICY "Event admins can update access codes"
  ON public.access_codes FOR UPDATE
  USING (rls_is_event_admin(event_id));

-- ANTES: role = 'admin' global
-- AHORA: Admin del evento
DROP POLICY IF EXISTS "Admins can delete access codes" ON public.access_codes;

CREATE POLICY "Event admins can delete access codes"
  ON public.access_codes FOR DELETE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TICKETS                                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT propio: se mantiene (auth.uid() = user_id) — NO TOCAR
-- INSERT propio: se mantiene (auth.uid() = user_id) — NO TOCAR

-- ANTES: Scanners checaban users.role + users.event_id (solo evento activo)
-- AHORA: Staff del evento via user_events
DROP POLICY IF EXISTS "Scanners can view event tickets" ON tickets;

CREATE POLICY "Event staff can view tickets"
  ON tickets FOR SELECT
  USING (rls_is_event_staff(event_id));

-- ANTES: role = 'admin' global sin filtro — admin de evento A veia tickets de evento B
-- AHORA: Admin del evento especifico
DROP POLICY IF EXISTS "Admins full access to tickets" ON tickets;

CREATE POLICY "Event admins full access to tickets"
  ON tickets FOR ALL
  USING (rls_is_event_admin(event_id));

-- ANTES: Scanners checaban users.role + users.event_id
-- AHORA: Staff del evento via user_events
DROP POLICY IF EXISTS "Scanners can update tickets" ON tickets;

CREATE POLICY "Event staff can update tickets"
  ON tickets FOR UPDATE
  USING (rls_is_event_staff(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EVENT_SCHEDULE (admin policies)                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: role = 'admin' global (policy FOR ALL)
-- AHORA: Admin del evento especifico — separar en INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can manage event schedule" ON event_schedule;

CREATE POLICY "Event admins can insert schedule"
  ON event_schedule FOR INSERT
  WITH CHECK (rls_is_event_admin(event_id));

CREATE POLICY "Event admins can update schedule"
  ON event_schedule FOR UPDATE
  USING (rls_is_event_admin(event_id));

CREATE POLICY "Event admins can delete schedule"
  ON event_schedule FOR DELETE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PLAYLIST_SONGS (admin policies)                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: auth.uid() = added_by sin check de membership
-- AHORA: Propio usuario + miembro del evento
DROP POLICY IF EXISTS "Authenticated users can add songs" ON playlist_songs;

CREATE POLICY "Event members can add songs"
  ON playlist_songs FOR INSERT
  WITH CHECK (
    auth.uid() = added_by
    AND rls_is_event_member(event_id)
  );

-- ANTES: role = 'admin' global O el que la anadio
-- AHORA: Admin del evento O el propio autor
DROP POLICY IF EXISTS "Admins can delete songs" ON playlist_songs;

CREATE POLICY "Event admins or author can delete songs"
  ON playlist_songs FOR DELETE
  USING (
    rls_is_event_admin(event_id)
    OR auth.uid() = added_by
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ USER_EVENTS                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- SELECT propio: se mantiene (auth.uid() = user_id) — NO TOCAR
-- INSERT propio: se mantiene (auth.uid() = user_id) — NO TOCAR

-- ANTES: role = 'admin' global — admin veia memberships de TODOS los eventos
-- AHORA: Admin del evento especifico
DROP POLICY IF EXISTS "Admins can view all memberships for their events" ON user_events;

CREATE POLICY "Event admins can view memberships"
  ON user_events FOR SELECT
  USING (rls_is_event_admin(event_id));

-- ANTES: role = 'admin' global (policy FOR ALL)
-- AHORA: Admin del evento — separar en INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can manage memberships" ON user_events;

CREATE POLICY "Event admins can insert memberships"
  ON user_events FOR INSERT
  WITH CHECK (rls_is_event_admin(event_id));

CREATE POLICY "Event admins can update memberships"
  ON user_events FOR UPDATE
  USING (rls_is_event_admin(event_id));

CREATE POLICY "Event admins can delete memberships"
  ON user_events FOR DELETE
  USING (rls_is_event_admin(event_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VENUES (admin policies)                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: role IN (super_admin, admin) global (policy FOR ALL)
-- AHORA: Admin de la misma org — separar por operacion
DROP POLICY IF EXISTS "Org admins can manage venues" ON venues;

CREATE POLICY "Org admins can insert venues"
  ON venues FOR INSERT
  WITH CHECK (rls_is_org_admin(organization_id));

CREATE POLICY "Org admins can update venues"
  ON venues FOR UPDATE
  USING (rls_is_org_admin(organization_id));

CREATE POLICY "Org admins can delete venues"
  ON venues FOR DELETE
  USING (rls_is_org_admin(organization_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ INCIDENTS (admin policies)                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Staff global
-- AHORA: Staff del evento especifico
DROP POLICY IF EXISTS "Staff can create incidents" ON incidents;

CREATE POLICY "Event staff can create incidents"
  ON incidents FOR INSERT
  WITH CHECK (rls_is_event_staff(event_id));

-- ANTES: Admin global
-- AHORA: Admin del evento o admin de la org
DROP POLICY IF EXISTS "Admins can update incidents" ON incidents;

CREATE POLICY "Event admins can update incidents"
  ON incidents FOR UPDATE
  USING (
    rls_is_event_admin(event_id)
    OR (organization_id IS NOT NULL AND rls_is_org_admin(organization_id))
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ORGANIZATIONS (admin policies)                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: super_admin global o creador (policy FOR ALL)
-- AHORA: Separar por operacion, filtrar por org
DROP POLICY IF EXISTS "Super admins can manage organizations" ON organizations;

CREATE POLICY "Super admins can insert organizations"
  ON organizations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'super_admin'
    )
  );

CREATE POLICY "Org super admins can update organization"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'super_admin'
        AND organization_id = organizations.id
    )
  );

CREATE POLICY "Org super admins can delete organization"
  ON organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'super_admin'
        AND organization_id = organizations.id
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ MESSAGE_TEMPLATES (admin policies)                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Admin global (policy FOR ALL)
-- AHORA: Admin de la misma org — separar por operacion
DROP POLICY IF EXISTS "Admins can manage templates" ON message_templates;

CREATE POLICY "Org admins can insert templates"
  ON message_templates FOR INSERT
  WITH CHECK (rls_is_org_admin(organization_id));

CREATE POLICY "Org admins can update templates"
  ON message_templates FOR UPDATE
  USING (rls_is_org_admin(organization_id));

CREATE POLICY "Org admins can delete templates"
  ON message_templates FOR DELETE
  USING (rls_is_org_admin(organization_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ BROADCAST_LOG (admin policies)                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ANTES: Admin global
-- AHORA: Admin de la org
DROP POLICY IF EXISTS "Admins can create broadcasts" ON broadcast_log;

CREATE POLICY "Org admins can create broadcasts"
  ON broadcast_log FOR INSERT
  WITH CHECK (rls_is_org_admin(organization_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PUSH_SUBSCRIPTIONS — ya correcto, no se toca                            ║
-- ║ (auth.uid() = user_id para todas las operaciones)                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ============================================================================
-- RESUMEN DE CAMBIOS TOTALES
-- ============================================================================
--
-- PREREQUISITOS:
--   3 indices compuestos para membership checks
--   5 helper functions SECURITY DEFINER:
--     rls_is_event_member(event_id)  — miembro del evento (user_events o super_admin org)
--     rls_is_event_admin(event_id)   — admin del evento (user_events o super_admin org)
--     rls_is_event_staff(event_id)   — staff scanner+ del evento
--     rls_is_org_admin(org_id)       — admin de la organizacion
--     rls_is_org_member(org_id)      — pertenece a la organizacion
--   1 trigger actualizado (handle_new_user → inserta en user_events)
--   1 backfill query (usuarios existentes sin user_events row)
--
-- BLOQUE 1 — RPCs ARREGLADAS: 4
--   scan_ticket        → RAISE EXCEPTION si no es staff del evento
--   generate_ticket    → RAISE EXCEPTION si no es el propio user ni admin
--   generate_access_codes → RAISE EXCEPTION si no es admin del evento
--   get_user_visible_events → RAISE EXCEPTION si consulta otro usuario
--
-- BLOQUE 2 — SELECT CROSS-EVENT: 12 tablas
--   events, poll_options, poll_votes, event_schedule, playlist_songs,
--   playlist_votes, message_reactions, incidents, organizations,
--   venues, message_templates, broadcast_log
--
-- BLOQUE 3 — ADMIN POLICIES: 16 tablas
--   users, events, photos, messages, polls, poll_options, drink_orders,
--   access_codes, tickets, event_schedule, playlist_songs, user_events,
--   venues, incidents, organizations, message_templates, broadcast_log
--
-- TOTALES:
--   POLICIES ELIMINADAS (DROP):       38
--   POLICIES CREADAS (CREATE):        47
--   TABLAS AFECTADAS:                 19
--   TABLAS SIN CAMBIOS:               1 (push_subscriptions)
--
-- PATRON GENERAL:
--   ANTES:  users.role = 'admin' (global, sin filtro por evento)
--   AHORA:  user_events membership (por evento) + users.organization_id (por org)
--   SUPER_ADMIN: Accede via users.organization_id = events.organization_id
--                (no necesita row individual en user_events por cada evento)
-- ============================================================================
