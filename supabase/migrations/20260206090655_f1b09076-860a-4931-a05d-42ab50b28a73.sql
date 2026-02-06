
-- =============================================
-- FIX: Telegram trigger status check 'linked' → 'active'
-- Root cause: Trigger never fired because profiles.telegram_link_status is 'active', not 'linked'
-- =============================================

-- Recreate trigger function with correct status check
CREATE OR REPLACE FUNCTION public.trg_subscription_grant_telegram()
RETURNS TRIGGER AS $$
DECLARE
  club_mapping RECORD;
  profile_telegram RECORD;
BEGIN
  -- Only for active or trial subscriptions
  IF NEW.status NOT IN ('active', 'trial') THEN
    RETURN NEW;
  END IF;
  
  -- Skip if this is just an update and status didn't change to active/trial
  IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'trial') THEN
    RETURN NEW;
  END IF;
  
  -- Find active product-club mappings for this product
  FOR club_mapping IN 
    SELECT pcm.club_id 
    FROM product_club_mappings pcm
    WHERE pcm.product_id = NEW.product_id AND pcm.is_active = true
  LOOP
    -- Check if user has Telegram linked
    SELECT telegram_user_id, telegram_link_status 
    INTO profile_telegram
    FROM profiles 
    WHERE user_id = NEW.user_id;
    
    -- FIX: Check for 'active' instead of 'linked'
    IF profile_telegram.telegram_user_id IS NOT NULL 
       AND profile_telegram.telegram_link_status = 'active' THEN
      -- Add to queue (ignore conflict if already pending)
      INSERT INTO telegram_access_queue (user_id, club_id, subscription_id, action, status)
      VALUES (NEW.user_id, club_mapping.club_id, NEW.id, 'grant', 'pending')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure correct ownership for security
ALTER FUNCTION public.trg_subscription_grant_telegram() OWNER TO postgres;

-- Log the fix in audit_logs
INSERT INTO audit_logs (action, actor_type, meta)
VALUES (
  'system.trigger_fix_telegram_status',
  'system',
  jsonb_build_object(
    'description', 'Fixed trg_subscription_grant_telegram: linked → active',
    'reason', 'Trigger never fired because profiles.telegram_link_status uses active, not linked',
    'affected_users_estimate', 150
  )
);
