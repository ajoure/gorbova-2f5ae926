-- Drop and recreate RPC with correct structure
DROP FUNCTION IF EXISTS find_wrongly_revoked_users(INT);

CREATE OR REPLACE FUNCTION find_wrongly_revoked_users(p_limit INT DEFAULT 100)
RETURNS TABLE (
  user_id UUID,
  profile_id UUID,
  telegram_user_id BIGINT,
  subscription_id UUID,
  club_id UUID,
  access_end_at TIMESTAMPTZ,
  full_name TEXT,
  email TEXT,
  invite_sent_at TIMESTAMPTZ,
  invite_status TEXT,
  in_chat BOOLEAN,
  access_status TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (p.id, tc.id)
    s.user_id,
    p.id AS profile_id,
    p.telegram_user_id,
    s.id AS subscription_id,
    tc.id AS club_id,
    s.access_end_at,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) AS full_name,
    p.email,
    tcm.invite_sent_at,
    tcm.invite_status,
    tcm.in_chat,
    tcm.access_status,
    s.status
  FROM subscriptions_v2 s
  JOIN profiles p ON p.user_id = s.user_id
  JOIN telegram_clubs tc ON tc.is_active = true
  LEFT JOIN telegram_club_members tcm ON tcm.profile_id = p.id AND tcm.club_id = tc.id
  WHERE s.status IN ('active', 'trial', 'past_due')
    AND s.access_end_at > now()
    AND p.telegram_user_id IS NOT NULL
    AND (tcm.in_chat = false OR tcm.id IS NULL)
    AND (tcm.invite_sent_at IS NULL OR tcm.invite_sent_at < now() - interval '24 hours')
    AND (tcm.invite_retry_after IS NULL OR tcm.invite_retry_after < now())
  ORDER BY p.id, tc.id, s.access_end_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;