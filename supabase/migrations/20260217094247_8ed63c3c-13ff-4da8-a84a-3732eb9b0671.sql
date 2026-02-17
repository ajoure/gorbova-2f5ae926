
-- BLOCK 0: RBAC canonicalization

-- 1. Add admin role to 7500084@gmail.com for admin/super_admin parity
INSERT INTO public.user_roles_v2 (user_id, role_id)
SELECT 
  '05cd3754-d589-4d90-97d1-89ba2bee610b',
  r.id
FROM roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- 2. Add UNIQUE constraint to prevent duplicate role assignments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_v2_user_id_role_id_key'
  ) THEN
    ALTER TABLE public.user_roles_v2 ADD CONSTRAINT user_roles_v2_user_id_role_id_key UNIQUE (user_id, role_id);
  END IF;
END$$;

-- 3. Update has_role_v2 to support aliases (super-admin, superadmin → super_admin)
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
      AND r.code = CASE _role_code
        WHEN 'super-admin' THEN 'super_admin'
        WHEN 'superadmin' THEN 'super_admin'
        ELSE _role_code
      END
  );
$$;
