
-- =====================================================
-- FIX: Set search_path on functions that are missing it
-- This prevents search_path injection attacks
-- =====================================================

-- 1. check_payment_status_for_deal (SECURITY DEFINER) - uses TABLE return type
CREATE OR REPLACE FUNCTION public.check_payment_status_for_deal(p_payment_id uuid, p_payment_source text)
RETURNS TABLE(is_valid boolean, payment_status text, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- 2. find_false_revoke_notifications (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.find_false_revoke_notifications(since_timestamp timestamp with time zone)
RETURNS TABLE(user_id uuid, full_name text, email text, telegram_user_id bigint, notification_count bigint, last_notification_at timestamp with time zone, sub_status text, access_end_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tl.user_id,
    p.full_name,
    p.email,
    p.telegram_user_id,
    COUNT(*)::bigint as notification_count,
    MAX(tl.created_at) as last_notification_at,
    s.status::text as sub_status,
    s.access_end_at
  FROM telegram_logs tl
  JOIN profiles p ON p.user_id = tl.user_id
  LEFT JOIN subscriptions_v2 s ON s.user_id = tl.user_id AND s.status IN ('active', 'trial')
  WHERE tl.event_type = 'access_revoked'
    AND tl.created_at >= since_timestamp
    AND s.id IS NOT NULL
  GROUP BY tl.user_id, p.full_name, p.email, p.telegram_user_id, s.status, s.access_end_at
  ORDER BY notification_count DESC;
$$;

-- 3. get_payments_stats (with include_import parameter)
CREATE OR REPLACE FUNCTION public.get_payments_stats(from_date timestamp with time zone, to_date timestamp with time zone, include_import boolean DEFAULT false)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base_payments AS (
    SELECT 
      p.provider_payment_id as uid,
      p.provider,
      p.amount,
      p.transaction_type,
      COALESCE(o.status_override, p.status::text) as effective_status,
      p.paid_at,
      p.currency
    FROM payments_v2 p
    LEFT JOIN payment_status_overrides o 
      ON o.uid = p.provider_payment_id AND o.provider = p.provider
    WHERE p.provider = 'bepaid'
      AND (
        (NOT include_import AND p.origin IN ('bepaid', 'statement_sync')) OR
        (include_import AND p.origin IN ('bepaid', 'import', 'statement_sync'))
      )
      AND p.paid_at >= from_date 
      AND p.paid_at < (to_date + interval '1 day')
      AND p.provider_payment_id IS NOT NULL
  ),
  classified AS (
    SELECT 
      *,
      (effective_status IN ('successful', 'succeeded')) AS is_success,
      (effective_status IN ('failed', 'error', 'declined', 'expired', 'incomplete')) AS is_failed,
      (transaction_type IN ('Отмена', 'void', 'cancellation', 'authorization_void') 
        OR effective_status IN ('cancelled', 'canceled', 'void')) AS is_cancel,
      (transaction_type IN ('Возврат средств', 'refund', 'refunded') 
        OR effective_status = 'refunded') AS is_refund
    FROM base_payments
  ),
  aggregated AS (
    SELECT
      COUNT(*) FILTER (
        WHERE is_success 
          AND NOT is_refund 
          AND NOT is_cancel
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip', 'payment_apple_pay', 'payment_google_pay')
          AND amount > 0
      ) AS successful_count,
      COALESCE(SUM(amount) FILTER (
        WHERE is_success 
          AND NOT is_refund 
          AND NOT is_cancel
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip', 'payment_apple_pay', 'payment_google_pay')
          AND amount > 0
      ), 0) AS successful_amount,
      COUNT(*) FILTER (
        WHERE effective_status IN ('pending', 'processing')
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip')
      ) AS pending_count,
      COALESCE(SUM(amount) FILTER (
        WHERE effective_status IN ('pending', 'processing')
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip')
      ), 0) AS pending_amount,
      COUNT(*) FILTER (WHERE is_refund) AS refunded_count,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE is_refund), 0) AS refunded_amount,
      COUNT(*) FILTER (WHERE is_cancel AND NOT is_refund) AS cancelled_count,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE is_cancel AND NOT is_refund), 0) AS cancelled_amount,
      COUNT(*) FILTER (WHERE is_failed AND NOT is_cancel AND NOT is_refund) AS failed_count,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE is_failed AND NOT is_cancel AND NOT is_refund), 0) AS failed_amount,
      COUNT(*) AS total_count
    FROM classified
  )
  SELECT json_build_object(
    'successful_amount', successful_amount,
    'successful_count', successful_count,
    'pending_amount', pending_amount,
    'pending_count', pending_count,
    'refunded_amount', refunded_amount,
    'refunded_count', refunded_count,
    'cancelled_amount', cancelled_amount,
    'cancelled_count', cancelled_count,
    'failed_amount', failed_amount,
    'failed_count', failed_count,
    'total_count', total_count,
    'net_revenue', (successful_amount - refunded_amount - cancelled_amount)
  )
  FROM aggregated
$$;

-- 4. get_payments_stats (without include_import parameter)
CREATE OR REPLACE FUNCTION public.get_payments_stats(from_date timestamp with time zone, to_date timestamp with time zone)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base_payments AS (
    SELECT 
      p.provider_payment_id as uid,
      p.provider,
      p.amount,
      p.transaction_type,
      COALESCE(o.status_override, p.status::text) as effective_status,
      p.paid_at,
      p.currency
    FROM payments_v2 p
    LEFT JOIN payment_status_overrides o 
      ON o.uid = p.provider_payment_id AND o.provider = p.provider
    WHERE p.provider = 'bepaid'
      AND p.origin = 'bepaid'
      AND p.paid_at >= from_date 
      AND p.paid_at < (to_date + interval '1 day')
      AND p.provider_payment_id IS NOT NULL
  ),
  classified AS (
    SELECT 
      *,
      (effective_status IN ('successful', 'succeeded')) AS is_success,
      (effective_status IN ('failed', 'error', 'declined', 'expired', 'incomplete')) AS is_failed,
      (transaction_type IN ('Отмена', 'void', 'cancellation', 'authorization_void') 
        OR effective_status IN ('cancelled', 'canceled', 'void')) AS is_cancel,
      (transaction_type IN ('Возврат средств', 'refund', 'refunded') 
        OR effective_status = 'refunded') AS is_refund
    FROM base_payments
  ),
  aggregated AS (
    SELECT
      COUNT(*) FILTER (
        WHERE is_success 
          AND NOT is_refund 
          AND NOT is_cancel
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip', 'payment_apple_pay', 'payment_google_pay')
          AND amount > 0
      ) AS successful_count,
      COALESCE(SUM(amount) FILTER (
        WHERE is_success 
          AND NOT is_refund 
          AND NOT is_cancel
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip', 'payment_apple_pay', 'payment_google_pay')
          AND amount > 0
      ), 0) AS successful_amount,
      COUNT(*) FILTER (
        WHERE effective_status IN ('pending', 'processing')
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip')
      ) AS pending_count,
      COALESCE(SUM(amount) FILTER (
        WHERE effective_status IN ('pending', 'processing')
          AND transaction_type IN ('Платеж', 'payment', 'payment_card', 'payment_erip')
      ), 0) AS pending_amount,
      COUNT(*) FILTER (WHERE is_refund) AS refunded_count,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE is_refund), 0) AS refunded_amount,
      COUNT(*) FILTER (WHERE is_cancel AND NOT is_refund) AS cancelled_count,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE is_cancel AND NOT is_refund), 0) AS cancelled_amount,
      COUNT(*) FILTER (WHERE is_failed AND NOT is_cancel AND NOT is_refund) AS failed_count,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE is_failed AND NOT is_cancel AND NOT is_refund), 0) AS failed_amount,
      COUNT(*) AS total_count
    FROM classified
  )
  SELECT json_build_object(
    'successful_amount', successful_amount,
    'successful_count', successful_count,
    'pending_amount', pending_amount,
    'pending_count', pending_count,
    'refunded_amount', refunded_amount,
    'refunded_count', refunded_count,
    'cancelled_amount', cancelled_amount,
    'cancelled_count', cancelled_count,
    'failed_amount', failed_amount,
    'failed_count', failed_count,
    'total_count', total_count,
    'net_revenue', (successful_amount - refunded_amount - cancelled_amount)
  )
  FROM aggregated
$$;

-- 5. normalize_card_brand
CREATE OR REPLACE FUNCTION public.normalize_card_brand(_brand text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE 
    WHEN lower(_brand) IN ('visa', 'visa classic', 'visa gold', 'visa platinum', 'visa signature') THEN 'visa'
    WHEN lower(_brand) IN ('mastercard', 'master', 'mc', 'mastercard gold', 'mastercard platinum', 'mastercard world') THEN 'mastercard'
    WHEN lower(_brand) IN ('mir', 'мир') THEN 'mir'
    WHEN lower(_brand) IN ('belkart', 'белкарт') THEN 'belkart'
    WHEN lower(_brand) IN ('unionpay', 'union pay', 'cup') THEN 'unionpay'
    WHEN lower(_brand) IN ('maestro') THEN 'maestro'
    WHEN lower(_brand) IN ('amex', 'american express') THEN 'amex'
    ELSE lower(COALESCE(_brand, 'unknown'))
  END;
$$;

-- 6. set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 7. unlock_stuck_media_jobs
CREATE OR REPLACE FUNCTION public.unlock_stuck_media_jobs(stuck_seconds integer DEFAULT 300)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.media_jobs
     SET status = 'pending', locked_at = NULL
   WHERE status = 'processing'
     AND locked_at IS NOT NULL
     AND locked_at < now() - make_interval(secs => stuck_seconds);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 8. update_verification_jobs_updated_at
CREATE OR REPLACE FUNCTION public.update_verification_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
