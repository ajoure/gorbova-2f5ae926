
-- =============================================================================
-- MIGRATION: Fix stale telegram_club_members for club "Бухгалтерия как бизнес"
-- + Update RPC admin_get_club_membership with active grant priority
-- =============================================================================

-- STEP 1: Reset stale access_status='ok' records for Бухгалтерия клуб
-- Only affects users who: are NOT in chat, NOT in channel, have NO active grant
UPDATE telegram_club_members tcm
SET 
  access_status = 'no_access',
  updated_at = NOW()
WHERE 
  tcm.club_id = '4f8f9d8f-07ce-4898-8012-39f1035c1456'
  AND tcm.access_status = 'ok'
  AND tcm.in_chat = false
  AND tcm.in_channel = false
  AND NOT EXISTS (
    SELECT 1 
    FROM telegram_access_grants tag
    JOIN profiles pr ON pr.user_id = tag.user_id
    WHERE pr.id = tcm.profile_id
      AND tag.club_id = tcm.club_id
      AND tag.status = 'active'
      AND (tag.end_at IS NULL OR tag.end_at > NOW())
  );

-- STEP 2: Also fix Валентина Ярошевич specifically (profile_id: cd4e52b0-bfb4-4e0b-a8f6-2b7f9abf4b07)
-- Her Бухгалтерия record shows ok but she has no grants there
UPDATE telegram_club_members
SET access_status = 'no_access', updated_at = NOW()
WHERE profile_id = 'cd4e52b0-bfb4-4e0b-a8f6-2b7f9abf4b07'
  AND club_id = '4f8f9d8f-07ce-4898-8012-39f1035c1456'
  AND access_status IN ('ok', 'active');

-- STEP 3: Update RPC admin_get_club_membership to prioritize clubs with active grants
CREATE OR REPLACE FUNCTION public.admin_get_club_membership(p_profile_id uuid)
RETURNS TABLE (
  access_status text,
  in_chat boolean,
  in_channel boolean,
  club_id uuid,
  club_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Permission check
  IF NOT public.has_permission(auth.uid(), 'entitlements.manage') THEN
    RAISE EXCEPTION 'access denied: entitlements.manage permission required';
  END IF;

  -- Get user_id from profile
  SELECT pr.user_id INTO v_user_id
  FROM profiles pr
  WHERE pr.id = p_profile_id;

  RETURN QUERY
  SELECT
    tcm.access_status::text,
    tcm.in_chat,
    tcm.in_channel,
    tcm.club_id,
    tc.club_name
  FROM telegram_club_members tcm
  JOIN telegram_clubs tc ON tc.id = tcm.club_id
  WHERE tcm.profile_id = p_profile_id
  ORDER BY
    -- Priority 1: physically in chat or channel
    (CASE WHEN tcm.in_chat = TRUE OR tcm.in_channel = TRUE THEN 0 ELSE 1 END) ASC,
    -- Priority 2: has active grant for this specific club
    (CASE WHEN EXISTS (
      SELECT 1 FROM telegram_access_grants tag2
      WHERE tag2.user_id = v_user_id
        AND tag2.club_id = tcm.club_id
        AND tag2.status = 'active'
        AND (tag2.end_at IS NULL OR tag2.end_at > NOW())
    ) THEN 0 ELSE 1 END) ASC,
    -- Priority 3: access_status is not no_access/removed
    (CASE WHEN tcm.access_status IN ('no_access', 'removed', 'revoked') THEN 1 ELSE 0 END) ASC,
    -- Priority 4: most recently updated
    tcm.updated_at DESC
  LIMIT 1;
END;
$$;

-- STEP 4: Log cleanup action to audit
INSERT INTO audit_logs (action, actor_type, actor_label, meta)
VALUES (
  'admin.telegram.stale_records_cleanup',
  'system',
  'migration',
  jsonb_build_object(
    'club_id', '4f8f9d8f-07ce-4898-8012-39f1035c1456',
    'club_name', 'Бухгалтерия как бизнес',
    'reason', 'stale ok records from Feb 5 mass import - no actual grants',
    'fixed_at', NOW()::text
  )
);
