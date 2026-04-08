-- HOTFIX: events INSERT policy falla cuando organization_id es NULL
-- El admin puede no tener organization_id en su users row,
-- lo que hace que rls_is_org_admin(NULL) devuelva FALSE → 403.
-- Solución: si org_id es NULL, permitir a cualquier admin/super_admin insertar.

DROP POLICY IF EXISTS "Org admins can create events" ON public.events;

CREATE POLICY "Org admins can create events"
  ON public.events FOR INSERT
  WITH CHECK (
    CASE
      WHEN organization_id IS NULL THEN
        -- Sin org asignada: cualquier admin/super_admin puede crear
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
      ELSE
        -- Con org asignada: debe ser admin de esa org
        rls_is_org_admin(organization_id)
    END
  );

-- Verificar que la policy existe
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'events' AND policyname = 'Org admins can create events';
