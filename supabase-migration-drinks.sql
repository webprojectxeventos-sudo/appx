-- ============================================================================
-- MIGRATION: Sistema de Pedido de Bebidas + Género + Tipo de Evento
-- Ejecutar en Supabase SQL Editor DESPUÉS de la migración de access_codes
-- ============================================================================

-- 1. Añadir tipo de evento a events
ALTER TABLE public.events
ADD COLUMN event_type text NOT NULL DEFAULT 'fiesta'
CHECK (event_type IN ('eso', 'fiesta'));

COMMENT ON COLUMN public.events.event_type IS 'eso = menores (solo refrescos), fiesta = adultos (alcohol + refrescos)';

-- 2. Añadir género a users
ALTER TABLE public.users
ADD COLUMN gender text CHECK (gender IN ('masculino', 'femenino', 'otro'));

-- 3. Nueva tabla: drink_orders
CREATE TABLE public.drink_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alcohol_choice text,       -- NULL para eventos ESO
  soft_drink_choice text NOT NULL,
  allergies text[] DEFAULT '{}',  -- Array de alergias predefinidas
  allergy_notes text,              -- Campo libre para "otros"
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

COMMENT ON TABLE public.drink_orders IS 'Pedidos de bebida pre-fiesta. Un pedido por persona por evento.';

-- 4. Índices
CREATE INDEX idx_drink_orders_event_id ON public.drink_orders(event_id);
CREATE INDEX idx_drink_orders_user_id ON public.drink_orders(user_id);

-- 5. RLS
ALTER TABLE public.drink_orders ENABLE ROW LEVEL SECURITY;

-- Usuarios pueden ver su propio pedido
CREATE POLICY "Users can view own drink order"
  ON public.drink_orders FOR SELECT
  USING (user_id = auth.uid());

-- Admins pueden ver todos los pedidos
CREATE POLICY "Admins can view all drink orders"
  ON public.drink_orders FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Usuarios pueden insertar su propio pedido
CREATE POLICY "Users can insert own drink order"
  ON public.drink_orders FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND event_id = drink_orders.event_id)
  );

-- Usuarios pueden actualizar su propio pedido
CREATE POLICY "Users can update own drink order"
  ON public.drink_orders FOR UPDATE
  USING (user_id = auth.uid());

-- Admins pueden borrar pedidos
CREATE POLICY "Admins can delete drink orders"
  ON public.drink_orders FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
