
CREATE OR REPLACE FUNCTION public.get_club_business_stats(
  p_club_id uuid,
  p_period_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
  -- Все гранты клуба
  grants AS (
    SELECT user_id, status, created_at, updated_at, end_at
    FROM telegram_access_grants
    WHERE club_id = p_club_id
  ),
  -- Уникальные активные участники прямо сейчас (с живым end_at)
  active_users AS (
    SELECT DISTINCT user_id
    FROM grants
    WHERE status = 'active'
      AND (end_at IS NULL OR end_at > NOW())
  ),
  -- Первый grant каждого пользователя в этом клубе
  first_grants AS (
    SELECT user_id, MIN(created_at) AS first_at
    FROM grants
    GROUP BY user_id
  ),
  -- Последний grant каждого пользователя (по created_at DESC)
  latest_grants AS (
    SELECT DISTINCT ON (user_id)
      user_id, status, updated_at
    FROM grants
    ORDER BY user_id, created_at DESC
  ),
  since AS (
    SELECT NOW() - (p_period_days || ' days')::interval AS dt
  )
SELECT jsonb_build_object(
  'total_with_access',
    (SELECT COUNT(*) FROM active_users),
  'new_count',
    (
      SELECT COUNT(*)
      FROM first_grants fg, since s
      WHERE fg.first_at >= s.dt
    ),
  'revoked_count',
    (
      SELECT COUNT(*)
      FROM latest_grants lg, since s
      WHERE lg.status IN ('revoked', 'expired')
        AND lg.updated_at >= s.dt
        AND NOT EXISTS (
          SELECT 1 FROM active_users au WHERE au.user_id = lg.user_id
        )
    )
);
$$;

-- Выдать права на выполнение функции
GRANT EXECUTE ON FUNCTION public.get_club_business_stats(uuid, integer) TO authenticated;
