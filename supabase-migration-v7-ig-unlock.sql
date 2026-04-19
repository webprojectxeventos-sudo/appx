-- ============================================================================
-- MIGRATION V7: Instagram follow-gate for Dropbox album access
-- ============================================================================
-- CONTEXTO: Queremos gatear el link de descarga completa del album de Dropbox
--   detras de un "sigue nuestra cuenta de Instagram". La verificacion es
--   honor system (la API de Instagram no permite verificar follows desde
--   diciembre 2024). Solo guardamos que el usuario ha marcado "ya te sigo".
--
--   Alcance:
--     - Solo aplica a la galeria (al boton "Ver todas las fotos en Dropbox")
--     - Todos los eventos lo tienen activado (no es configurable por evento)
--     - Staff (admin/super_admin/scanner/etc.) salta el gate automaticamente
--
-- ESTRUCTURA: una tabla dedicada (no una columna en users) para poder
--   extender facilmente en el futuro ("gate tambien el aftermovie", "gate
--   por evento especifico", etc.) sin tocar el schema de users.
-- ============================================================================
-- REVISAR ANTES DE EJECUTAR. NO ejecutar en produccion sin backup.
-- ============================================================================


-- ============================================================================
-- SECTION 1: TABLA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_ig_unlocks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_ig_unlocks IS
  'Marca que un usuario ha declarado seguir a @tugraduacionmadrid en Instagram. Honor system, no verificable.';


-- ============================================================================
-- SECTION 2: RLS
-- ============================================================================

ALTER TABLE public.user_ig_unlocks ENABLE ROW LEVEL SECURITY;

-- SELECT: cada usuario ve solo su propia fila
DROP POLICY IF EXISTS "Users can view own ig unlock" ON public.user_ig_unlocks;
CREATE POLICY "Users can view own ig unlock"
  ON public.user_ig_unlocks FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: cada usuario solo puede insertar su propia fila
DROP POLICY IF EXISTS "Users can insert own ig unlock" ON public.user_ig_unlocks;
CREATE POLICY "Users can insert own ig unlock"
  ON public.user_ig_unlocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE, no DELETE policies: una vez desbloqueado se queda desbloqueado.
-- Si quisieramos forzar "re-follow cada X dias" en el futuro, anadimos aqui.


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- 1 tabla nueva: user_ig_unlocks (user_id PK, unlocked_at)
-- 2 politicas RLS: SELECT own, INSERT own
-- Sin UPDATE/DELETE (desbloqueo es permanente)
