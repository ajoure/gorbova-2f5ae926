
-- Phase 1: Bridge has_role() to user_roles_v2

-- 1) Ensure has_role_v2 exists
CREATE OR REPLACE FUNCTION public.has_role_v2(_user_id uuid, _role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles_v2 ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.code = _role_code
  );
$$;

-- 2) Bridge: rewrite legacy has_role(uuid, app_role) to check user_roles_v2
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_v2(
    _user_id,
    CASE _role::text
      WHEN 'superadmin' THEN 'super_admin'
      ELSE _role::text
    END
  );
$$;
