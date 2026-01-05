-- Fix role checks for RLS policies by making has_role compatible with both role systems
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles_v2 ur2
      JOIN public.roles r ON r.id = ur2.role_id
      WHERE ur2.user_id = _user_id
        AND (
          (_role = 'user'::app_role AND r.code IN ('user','editor','support','admin','super_admin','superadmin'))
          OR (_role = 'admin'::app_role AND r.code IN ('admin','super_admin','superadmin'))
          OR (_role = 'superadmin'::app_role AND r.code IN ('super_admin','superadmin'))
        )
    );
$$;