-- Fix get_bepaid_statement_stats: use exact string matching instead of ILIKE
-- This fixes the bug where "Неуспешный" was matching "%успешн%" pattern

CREATE OR REPLACE FUNCTION public.get_bepaid_statement_stats(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Успешные платежи: status = 'Успешный' И transaction_type = 'Платеж' И amount > 0
    'payments_count', COUNT(*) FILTER (
      WHERE status = 'Успешный'
        AND transaction_type = 'Платеж'
        AND amount > 0
    ),
    'payments_amount', COALESCE(SUM(amount) FILTER (
      WHERE status = 'Успешный'
        AND transaction_type = 'Платеж'
        AND amount > 0
    ), 0),
    
    -- Возвраты: transaction_type = 'Возврат средств'
    'refunds_count', COUNT(*) FILTER (
      WHERE transaction_type = 'Возврат средств'
    ),
    'refunds_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE transaction_type = 'Возврат средств'
    ), 0),
    
    -- Отмены: transaction_type = 'Отмена'
    'cancellations_count', COUNT(*) FILTER (
      WHERE transaction_type = 'Отмена'
    ),
    'cancellations_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE transaction_type = 'Отмена'
    ), 0),
    
    -- Ошибки: status = 'Неуспешный'
    'errors_count', COUNT(*) FILTER (
      WHERE status = 'Неуспешный'
    ),
    'errors_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE status = 'Неуспешный'
    ), 0),
    
    -- Комиссия и перечисления (только по успешным платежам)
    'commission_total', COALESCE(SUM(commission_total) FILTER (
      WHERE status = 'Успешный' AND transaction_type = 'Платеж'
    ), 0),
    'payout_total', COALESCE(SUM(payout_amount) FILTER (
      WHERE status = 'Успешный' AND transaction_type = 'Платеж'
    ), 0),
    
    'total_count', COUNT(*)
  )
  INTO result
  FROM bepaid_statement_rows
  WHERE sort_ts >= from_date 
    AND sort_ts <= to_date;
  
  RETURN result;
END;
$$;