-- ============================================================================
-- HOTFIX: Fix infinite recursion in users table RLS policies
-- ============================================================================
-- PROBLEMA: Las policies "Org admins can view org users" y
--           "Org admins can update org users" hacen SELECT FROM users
--           dentro de una policy ON users, causando recursion infinita.
--
-- SOLUCION: Usar una funcion SECURITY DEFINER que bypassa RLS para
--           obtener el role y organization_id del caller.
-- ============================================================================

-- Helper: returns the caller's (role, organization_id) bypassing RLS
CREATE OR REPLACE FUNCTION public.rls_get_caller_org()
RETURNS TABLE(caller_role TEXT, caller_org_id UUID)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT role, organization_id
  FROM users
  WHERE id = auth.uid();
$$;

-- Fix SELECT policy
DROP POLICY IF EXISTS "Org admins can view org users" ON public.users;

CREATE POLICY "Org admins can view org users"
  ON public.users FOR SELECT
  USING (
    -- Users can always see themselves (handled by existing "Users can view own profile" policy)
    -- Admins can see users in their org
    EXISTS (
      SELECT 1 FROM rls_get_caller_org() c
      WHERE c.caller_role IN ('admin', 'super_admin')
        AND c.caller_org_id IS NOT NULL
        AND c.caller_org_id = users.organization_id
    )
  );

-- Fix UPDATE policy
DROP POLICY IF EXISTS "Org admins can update org users" ON public.users;

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
