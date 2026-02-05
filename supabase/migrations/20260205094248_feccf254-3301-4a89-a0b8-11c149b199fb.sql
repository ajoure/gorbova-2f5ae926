
-- Fix admin_get_payments_stats_v1: add payout_total, commission_total from meta,
-- support both Russian and English transaction types
-- PATCH: Извлечение комиссии и перечислений из meta->>'...' с безопасным кастом

CREATE OR REPLACE FUNCTION public.admin_get_payments_stats_v1(
  p_from TIMESTAMPTZ, 
  p_to TIMESTAMPTZ, 
  p_provider TEXT DEFAULT 'bepaid'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    
    -- Успешные платежи (НЕ refund/void/Отмена/Возврат)
    -- Поддержка ru/en типов транзакций на переходный период
    'successful_count', COUNT(*) FILTER (
      WHERE status::text IN ('successful','succeeded') 
        AND COALESCE(transaction_type,'') NOT IN ('refund','void','Возврат средств','Отмена')
        AND amount > 0
    ),
    'successful_amount', COALESCE(SUM(amount) FILTER (
      WHERE status::text IN ('successful','succeeded') 
        AND COALESCE(transaction_type,'') NOT IN ('refund','void','Возврат средств','Отмена')
        AND amount > 0
    ), 0),
    
    -- Возвраты: transaction_type содержит refund/Возврат или status=refunded
    'refunded_count', COUNT(*) FILTER (
      WHERE COALESCE(transaction_type,'') IN ('refund','Возврат средств')
        OR status::text = 'refunded'
    ),
    'refunded_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE COALESCE(transaction_type,'') IN ('refund','Возврат средств')
        OR status::text = 'refunded'
    ), 0),
    
    -- Отмены: transaction_type = void/Отмена или status IN (cancelled, canceled, void)
    'cancelled_count', COUNT(*) FILTER (
      WHERE COALESCE(transaction_type,'') IN ('void','Отмена')
        OR status::text IN ('cancelled','canceled','void')
    ),
    'cancelled_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE COALESCE(transaction_type,'') IN ('void','Отмена')
        OR status::text IN ('cancelled','canceled','void')
    ), 0),
    
    -- Ошибки: status IN (failed, declined, expired, error) и НЕ void/Отмена
    'failed_count', COUNT(*) FILTER (
      WHERE status::text IN ('failed','declined','expired','error')
        AND COALESCE(transaction_type,'') NOT IN ('void','Отмена')
    ),
    'failed_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE status::text IN ('failed','declined','expired','error')
        AND COALESCE(transaction_type,'') NOT IN ('void','Отмена')
    ), 0),
    
    -- В обработке
    'processing_count', COUNT(*) FILTER (
      WHERE status::text IN ('pending','processing')
    ),
    'processing_amount', COALESCE(SUM(amount) FILTER (
      WHERE status::text IN ('pending','processing')
    ), 0),
    
    -- Комиссия из meta->>'commission_total' (только по успешным платежам, не refund/void)
    -- Безопасный каст: replace(',', '.') + regexp_replace для удаления всего кроме цифр и точки
    'commission_total', COALESCE(SUM(
      NULLIF(
        regexp_replace(
          replace(COALESCE(meta->>'commission_total', '0'), ',', '.'),
          '[^0-9.\-]', '', 'g'
        ), ''
      )::numeric
    ) FILTER (
      WHERE meta ? 'commission_total'
        AND status::text IN ('successful','succeeded')
        AND COALESCE(transaction_type,'') NOT IN ('refund','void','Возврат средств','Отмена')
    ), 0),
    
    -- Перечислено из meta->>'payout_amount' (только по успешным платежам, не refund/void)
    'payout_total', COALESCE(SUM(
      NULLIF(
        regexp_replace(
          replace(COALESCE(meta->>'payout_amount', '0'), ',', '.'),
          '[^0-9.\-]', '', 'g'
        ), ''
      )::numeric
    ) FILTER (
      WHERE meta ? 'payout_amount'
        AND status::text IN ('successful','succeeded')
        AND COALESCE(transaction_type,'') NOT IN ('refund','void','Возврат средств','Отмена')
    ), 0)
  )
  INTO result
  FROM public.payments_v2
  WHERE provider = p_provider
    AND paid_at >= p_from AND paid_at <= p_to;

  RETURN result;
END;
$$;

-- Grant execute to service_role (keep existing policy)
GRANT EXECUTE ON FUNCTION public.admin_get_payments_stats_v1 TO service_role;
