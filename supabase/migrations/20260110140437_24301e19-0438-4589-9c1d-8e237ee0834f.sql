-- Drop old RLS policies
DROP POLICY IF EXISTS "Superadmins can view menu settings" ON public.admin_menu_settings;
DROP POLICY IF EXISTS "Superadmins can update menu settings" ON public.admin_menu_settings;
DROP POLICY IF EXISTS "Superadmins can insert menu settings" ON public.admin_menu_settings;

-- Create security definer function to check superadmin role
CREATE OR REPLACE FUNCTION public.is_superadmin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = check_user_id
      AND role = 'superadmin'::app_role
  )
$$;

-- Recreate RLS policies using the function
CREATE POLICY "Superadmins can view menu settings" 
ON public.admin_menu_settings 
FOR SELECT 
USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can update menu settings" 
ON public.admin_menu_settings 
FOR UPDATE 
USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmins can insert menu settings" 
ON public.admin_menu_settings 
FOR INSERT 
WITH CHECK (public.is_superadmin(auth.uid()));