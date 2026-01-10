-- Create admin menu settings table
CREATE TABLE public.admin_menu_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_menu_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can view menu settings
CREATE POLICY "Super admins can view menu settings"
ON public.admin_menu_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'::app_role
  )
);

CREATE POLICY "Super admins can update menu settings"
ON public.admin_menu_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'::app_role
  )
);

CREATE POLICY "Super admins can insert menu settings"
ON public.admin_menu_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'::app_role
  )
);

-- Insert default empty settings row
INSERT INTO public.admin_menu_settings (items) VALUES ('[]'::jsonb);