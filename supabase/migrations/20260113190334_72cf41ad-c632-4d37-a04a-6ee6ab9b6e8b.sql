-- Fix search_path for the link_profile_on_user_create function
CREATE OR REPLACE FUNCTION public.link_profile_on_user_create()
RETURNS TRIGGER AS $$
DECLARE
  matching_profile_id uuid;
BEGIN
  -- Find profile by email that has no user_id yet
  SELECT id INTO matching_profile_id
  FROM public.profiles
  WHERE email = NEW.email
    AND user_id IS NULL
  LIMIT 1;
  
  IF matching_profile_id IS NOT NULL THEN
    -- Link profile with new user
    UPDATE public.profiles
    SET user_id = NEW.id
    WHERE id = matching_profile_id;
    
    -- Transfer orders to new user
    UPDATE public.orders_v2
    SET user_id = NEW.id
    WHERE user_id = matching_profile_id::text;
    
    -- Update entitlements user_id (keep profile_id for reference)
    UPDATE public.entitlements
    SET user_id = NEW.id
    WHERE profile_id = matching_profile_id AND (user_id IS NULL OR user_id = matching_profile_id::text);
    
    -- Log the linking
    INSERT INTO public.audit_logs (action, actor_user_id, target_user_id, meta)
    VALUES (
      'profile.auto_linked_on_registration',
      NEW.id,
      NEW.id,
      jsonb_build_object(
        'profile_id', matching_profile_id,
        'email', NEW.email
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;