-- ============================================================================
-- MIGRATION: Sistema de Códigos de Acceso Individuales (Anti-fraude)
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- 1. Nueva tabla: access_codes
CREATE TABLE public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  label text,                -- etiqueta opcional (ej: "Instituto San José #001")
  is_active boolean DEFAULT true,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.access_codes IS 'Códigos de acceso individuales. Cada código solo se puede usar UNA vez.';

-- 2. Índices
CREATE INDEX idx_access_codes_event_id ON public.access_codes(event_id);
CREATE INDEX idx_access_codes_code ON public.access_codes(code);
CREATE INDEX idx_access_codes_used_by ON public.access_codes(used_by);
CREATE INDEX idx_access_codes_is_active ON public.access_codes(is_active);

-- 3. RLS
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- Admins pueden ver todos los códigos
CREATE POLICY "Admins can view all access codes"
  ON public.access_codes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Usuarios pueden ver su propio código
CREATE POLICY "Users can view their own access code"
  ON public.access_codes FOR SELECT
  USING (used_by = auth.uid());

-- Solo admins pueden insertar códigos
CREATE POLICY "Admins can insert access codes"
  ON public.access_codes FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Solo admins pueden actualizar códigos
CREATE POLICY "Admins can update access codes"
  ON public.access_codes FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Solo admins pueden borrar códigos
CREATE POLICY "Admins can delete access codes"
  ON public.access_codes FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Función para VALIDAR código (accesible sin autenticación, para registro)
CREATE OR REPLACE FUNCTION public.validate_access_code(code_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'event_id', ac.event_id,
    'code_id', ac.id,
    'event_title', e.title
  )
  INTO result
  FROM public.access_codes ac
  JOIN public.events e ON e.id = ac.event_id
  WHERE ac.code = UPPER(REPLACE(code_text, '-', ''))
    AND ac.is_active = true
    AND ac.used_by IS NULL;

  RETURN result;
END;
$$;

-- 5. Actualizar trigger handle_new_user para reclamar el código
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Crear perfil de usuario
  INSERT INTO public.users (id, email, full_name, role, event_id, gender)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'attendee'),
    (NEW.raw_user_meta_data->>'event_id')::uuid,
    NEW.raw_user_meta_data->>'gender'
  );

  -- Reclamar código de acceso si se proporcionó
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

-- Asegurarse de que el trigger existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Función para generar códigos en lote (llamada desde admin)
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
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Sin 0/O/1/I para evitar confusión
  inserted integer := 0;
BEGIN
  WHILE inserted < quantity LOOP
    -- Generar código aleatorio de 8 caracteres
    new_code := '';
    FOR j IN 1..8 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Intentar insertar (puede fallar por UNIQUE constraint, en ese caso reintentar)
    BEGIN
      INSERT INTO public.access_codes (event_id, code, label)
      VALUES (target_event_id, new_code, code_label);
      inserted := inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Código duplicado, generar otro
      CONTINUE;
    END;

    i := i + 1;
    -- Seguridad: no hacer más de quantity * 10 intentos
    IF i > quantity * 10 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN inserted;
END;
$$;
