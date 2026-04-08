-- ============================================================================
-- MIGRATION: Reacciones en mensajes del chat
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('🔥', '❤️', '🎉', '👏', '😂')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON public.message_reactions(user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Usuarios del evento pueden ver reacciones
CREATE POLICY "Users can view reactions"
  ON public.message_reactions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Usuarios pueden añadir su propia reacción
CREATE POLICY "Users can insert own reaction"
  ON public.message_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Usuarios pueden quitar su propia reacción
CREATE POLICY "Users can delete own reaction"
  ON public.message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Habilitar realtime para reacciones
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
