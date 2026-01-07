-- 1. Add RLS policy for admins to view all consent logs
CREATE POLICY "Admins can view all consent logs"
ON public.consent_logs
FOR SELECT
USING (has_permission(auth.uid(), 'users.view'::text));

-- 2. Change default value for marketing_consent to true
ALTER TABLE public.profiles 
ALTER COLUMN marketing_consent SET DEFAULT true;

-- 3. Update handle_new_user trigger to set marketing_consent and log it
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _user_role_id uuid;
  _current_policy_version text;
BEGIN
  -- Get current policy version
  SELECT version INTO _current_policy_version 
  FROM public.privacy_policy_versions 
  WHERE is_current = true 
  LIMIT 1;

  -- Create profile with marketing consent enabled by default
  INSERT INTO public.profiles (user_id, email, full_name, first_name, last_name, phone, marketing_consent)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      CONCAT_WS(' ', NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'last_name')
    ),
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'phone',
    true  -- Marketing consent enabled by default
  );
  
  -- Log marketing consent given at registration
  INSERT INTO public.consent_logs (
    user_id, 
    email, 
    consent_type, 
    policy_version, 
    granted, 
    source
  ) VALUES (
    NEW.id,
    NEW.email,
    'marketing',
    COALESCE(_current_policy_version, 'v2026-01-07'),
    true,
    'registration'
  );
  
  -- Assign default user role
  SELECT id INTO _user_role_id FROM public.roles WHERE code = 'user' LIMIT 1;
  
  IF _user_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles_v2 (user_id, role_id)
    VALUES (NEW.id, _user_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;