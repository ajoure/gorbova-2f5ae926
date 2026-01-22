-- PATCH 13+: Invite tracking и auto_renew tracking

-- 1. Добавить поля invite tracking в telegram_club_members
ALTER TABLE telegram_club_members
ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invite_status TEXT,
ADD COLUMN IF NOT EXISTS invite_error TEXT,
ADD COLUMN IF NOT EXISTS invite_retry_after TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_invite_link TEXT;

-- Комментарии для документации
COMMENT ON COLUMN telegram_club_members.invite_sent_at IS 'When invite was last sent to this user';
COMMENT ON COLUMN telegram_club_members.invite_status IS 'sent | rate_limited | error | joined | skipped';
COMMENT ON COLUMN telegram_club_members.invite_error IS 'Error message if invite failed';
COMMENT ON COLUMN telegram_club_members.invite_retry_after IS 'Do not retry invite before this time';
COMMENT ON COLUMN telegram_club_members.last_invite_link IS 'Last invite link sent to user';

-- 2. Добавить поля для отслеживания отключения auto_renew
ALTER TABLE subscriptions_v2
ADD COLUMN IF NOT EXISTS auto_renew_disabled_by TEXT,
ADD COLUMN IF NOT EXISTS auto_renew_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_renew_disabled_by_user_id UUID;

COMMENT ON COLUMN subscriptions_v2.auto_renew_disabled_by IS 'user | admin - who disabled auto-renewal';
COMMENT ON COLUMN subscriptions_v2.auto_renew_disabled_at IS 'When auto-renewal was disabled';
COMMENT ON COLUMN subscriptions_v2.auto_renew_disabled_by_user_id IS 'UUID of user/admin who disabled';

-- 3. Обновить RPC find_wrongly_revoked_users — исключать недавно приглашённых
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
  invite_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    s.user_id,
    p.id AS profile_id,
    p.telegram_user_id,
    s.id AS subscription_id,
    tc.id AS club_id,
    s.access_end_at,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) AS full_name,
    p.email,
    tcm.invite_sent_at,
    tcm.invite_status
  FROM subscriptions_v2 s
  JOIN profiles p ON p.user_id = s.user_id
  JOIN products_v2 pr ON pr.id = s.product_id
  JOIN telegram_clubs tc ON tc.product_id = pr.id AND tc.is_active = true
  LEFT JOIN telegram_club_members tcm ON tcm.profile_id = p.id AND tcm.club_id = tc.id
  WHERE s.status IN ('active', 'trial', 'past_due')
    AND s.access_end_at > now()
    AND p.telegram_user_id IS NOT NULL
    -- Пользователь НЕ в чате или записи нет
    AND (tcm.in_chat = false OR tcm.id IS NULL)
    -- Исключаем тех, кому invite отправлялся менее 24 часов назад
    AND (tcm.invite_sent_at IS NULL OR tcm.invite_sent_at < now() - interval '24 hours')
    -- Исключаем тех, у кого retry_after ещё не прошёл
    AND (tcm.invite_retry_after IS NULL OR tcm.invite_retry_after < now())
  ORDER BY p.id, s.access_end_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. RPC для создания сделки с проверкой статуса платежа (hard guard)
CREATE OR REPLACE FUNCTION check_payment_status_for_deal(
  p_payment_id UUID,
  p_payment_source TEXT -- 'queue' | 'payments_v2'
) RETURNS TABLE (
  is_valid BOOLEAN,
  payment_status TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Получить статус платежа
  IF p_payment_source = 'queue' THEN
    SELECT status INTO v_status 
    FROM payment_reconcile_queue WHERE id = p_payment_id;
  ELSE
    SELECT status INTO v_status 
    FROM payments_v2 WHERE id = p_payment_id;
  END IF;
  
  -- Проверить статус
  IF v_status IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, 'Payment not found'::TEXT;
    RETURN;
  END IF;
  
  IF lower(v_status) IN ('failed', 'declined', 'error', 'cancelled', 'expired', 'incomplete') THEN
    -- Записать в audit_logs
    INSERT INTO audit_logs (action, actor_type, actor_label, meta)
    VALUES (
      'deal.create_blocked_failed_payment',
      'system',
      'check_payment_status_for_deal',
      jsonb_build_object(
        'payment_id', p_payment_id,
        'payment_source', p_payment_source,
        'payment_status', v_status
      )
    );
    
    RETURN QUERY SELECT false, v_status, ('Cannot create deal from failed payment: ' || v_status)::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, v_status, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Функция для авто-коррекции billing dates
CREATE OR REPLACE FUNCTION ensure_billing_alignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Если next_charge_at < access_end_at, исправить
  IF NEW.next_charge_at IS NOT NULL 
     AND NEW.access_end_at IS NOT NULL 
     AND NEW.next_charge_at < NEW.access_end_at THEN
    
    -- Записать в audit
    INSERT INTO audit_logs (action, actor_type, actor_label, meta)
    VALUES (
      'billing.charge_date_auto_corrected',
      'system',
      'ensure_billing_alignment_trigger',
      jsonb_build_object(
        'subscription_id', NEW.id,
        'original_next_charge_at', NEW.next_charge_at,
        'corrected_to', NEW.access_end_at
      )
    );
    
    NEW.next_charge_at := NEW.access_end_at;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создать триггер если не существует
DROP TRIGGER IF EXISTS trg_ensure_billing_alignment ON subscriptions_v2;
CREATE TRIGGER trg_ensure_billing_alignment
  BEFORE INSERT OR UPDATE OF next_charge_at, access_end_at ON subscriptions_v2
  FOR EACH ROW
  EXECUTE FUNCTION ensure_billing_alignment();