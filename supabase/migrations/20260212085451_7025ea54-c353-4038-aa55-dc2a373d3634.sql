
-- PATCH 3: Fix trigger to fire on renewal (access_end_at change)
CREATE OR REPLACE FUNCTION public.trg_subscription_grant_telegram()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  club_mapping RECORD;
  profile_telegram RECORD;
BEGIN
  -- Only for active or trial subscriptions
  IF NEW.status NOT IN ('active', 'trial') THEN
    RETURN NEW;
  END IF;
  
  -- On UPDATE: skip ONLY if status was already active/trial AND access_end_at didn't change
  IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'trial') THEN
    IF NEW.access_end_at IS NOT DISTINCT FROM OLD.access_end_at THEN
      RETURN NEW;
    END IF;
    -- access_end_at changed = renewal, proceed to grant/queue
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
    
    -- Check for 'active' status
    IF profile_telegram.telegram_user_id IS NOT NULL 
       AND profile_telegram.telegram_link_status = 'active' THEN
      -- Add to queue (upsert: update if already pending for same user/club/sub)
      INSERT INTO telegram_access_queue (user_id, club_id, subscription_id, action, status)
      VALUES (NEW.user_id, club_mapping.club_id, NEW.id, 'grant', 'pending')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- PATCH 4: Data repair - update grants for at-risk users
-- Step 1: Update existing grants where end_at < subscription access_end_at
WITH at_risk AS (
  SELECT DISTINCT ON (g.id)
    g.id as grant_id,
    s.access_end_at as new_end_at
  FROM subscriptions_v2 s
  JOIN telegram_access_grants g ON g.user_id = s.user_id AND g.source = 'auto_subscription' AND g.status = 'active'
  JOIN profiles p ON p.user_id = s.user_id
  WHERE s.status IN ('active', 'trial', 'past_due')
    AND s.access_end_at > now()
    AND g.end_at < s.access_end_at
    AND p.email NOT IN ('a.bruylo@ajoure.by', 'nrokhmistrov@gmail.com', 'ceo@ajoure.by', 'irenessa@yandex.ru')
  LIMIT 200
)
UPDATE telegram_access_grants g
SET end_at = ar.new_end_at, updated_at = now()
FROM at_risk ar
WHERE g.id = ar.grant_id;

-- Step 2: Update telegram_access.active_until for users with active subs but outdated access
WITH sub_access AS (
  SELECT DISTINCT ON (ta.id)
    ta.id as access_id,
    s.access_end_at as new_active_until
  FROM subscriptions_v2 s
  JOIN telegram_access ta ON ta.user_id = s.user_id
  JOIN profiles p ON p.user_id = s.user_id
  WHERE s.status IN ('active', 'trial', 'past_due')
    AND s.access_end_at > now()
    AND (ta.active_until IS NULL OR ta.active_until < s.access_end_at)
    AND p.email NOT IN ('a.bruylo@ajoure.by', 'nrokhmistrov@gmail.com', 'ceo@ajoure.by', 'irenessa@yandex.ru')
  LIMIT 200
)
UPDATE telegram_access ta
SET active_until = sa.new_active_until, last_sync_at = now()
FROM sub_access sa
WHERE ta.id = sa.access_id;

-- Step 3: Queue grants for users with active subs but NO auto_subscription grant at all
INSERT INTO telegram_access_queue (user_id, club_id, subscription_id, action, status)
SELECT DISTINCT s.user_id, pcm.club_id, s.id, 'grant', 'pending'
FROM subscriptions_v2 s
JOIN product_club_mappings pcm ON pcm.product_id = s.product_id AND pcm.is_active = true
JOIN profiles p ON p.user_id = s.user_id
LEFT JOIN telegram_access_grants g 
  ON g.user_id = s.user_id 
  AND g.club_id = pcm.club_id
  AND g.source = 'auto_subscription' 
  AND g.status = 'active'
WHERE s.status IN ('active', 'trial', 'past_due')
  AND s.access_end_at > now()
  AND g.id IS NULL
  AND p.telegram_user_id IS NOT NULL
  AND p.telegram_link_status = 'active'
  AND p.email NOT IN ('a.bruylo@ajoure.by', 'nrokhmistrov@gmail.com', 'ceo@ajoure.by', 'irenessa@yandex.ru')
ON CONFLICT DO NOTHING;

-- Step 4: Audit log for this repair
INSERT INTO audit_logs (action, actor_type, actor_user_id, actor_label, meta)
VALUES (
  'telegram.grants.repair',
  'system',
  NULL,
  'tg-grants-repair',
  jsonb_build_object(
    'patch', 'TG-P0.9.2',
    'description', 'Data repair: sync grants.end_at with subscriptions.access_end_at and queue missing grants',
    'dry_run', false
  )
);
