-- PATCH: Пересоздать admin_get_club_membership с правильным именем колонки club_name
DROP FUNCTION IF EXISTS public.admin_get_club_membership(uuid);

CREATE OR REPLACE FUNCTION public.admin_get_club_membership(p_profile_id uuid)
RETURNS TABLE(
  access_status text,
  in_chat boolean,
  in_channel boolean,
  club_id uuid,
  club_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'entitlements.manage') THEN
    RAISE EXCEPTION 'access denied: entitlements.manage permission required';
  END IF;

  RETURN QUERY
  SELECT
    tcm.access_status::text,
    tcm.in_chat,
    tcm.in_channel,
    tcm.club_id,
    tc.club_name::text
  FROM telegram_club_members tcm
  LEFT JOIN telegram_clubs tc ON tc.id = tcm.club_id
  WHERE tcm.profile_id = p_profile_id
  ORDER BY
    (CASE WHEN tcm.in_chat = TRUE OR tcm.in_channel = TRUE THEN 0 ELSE 1 END) ASC,
    (CASE WHEN tcm.access_status = 'ok' THEN 0 ELSE 1 END) ASC,
    tcm.updated_at DESC NULLS LAST
  LIMIT 1;
END;
$$;