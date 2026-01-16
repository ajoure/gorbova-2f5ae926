-- Исправление search_path для функции триггера
CREATE OR REPLACE FUNCTION sync_payment_method_revocation()
RETURNS TRIGGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Если статус изменился на 'revoked' или 'deleted'
  IF NEW.status IN ('revoked', 'deleted') AND OLD.status = 'active' THEN
    -- Обнуляем payment_method_id в подписках
    UPDATE subscriptions_v2
    SET 
      payment_method_id = NULL,
      payment_token = NULL,
      auto_renew = false,
      cancel_at_period_end = true,
      meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
        'payment_method_revoked_at', now()::text,
        'revoked_payment_method_id', OLD.id::text
      )
    WHERE payment_method_id = OLD.id
      AND status IN ('active', 'trial', 'past_due');
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    
    -- Аудит-лог
    INSERT INTO audit_logs (action, actor_type, meta)
    VALUES (
      'payment_method.sync_subscriptions',
      'trigger',
      jsonb_build_object(
        'payment_method_id', OLD.id,
        'user_id', OLD.user_id,
        'card_last4', OLD.last4,
        'subscriptions_affected', affected_count,
        'trigger_action', 'revocation_sync'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;