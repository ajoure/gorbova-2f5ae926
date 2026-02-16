
DROP FUNCTION IF EXISTS public.inv20_paid_orders_without_payments(timestamptz, int);

CREATE OR REPLACE FUNCTION public.inv20_paid_orders_without_payments(p_since timestamptz, p_limit int DEFAULT 10)
RETURNS TABLE(count_total bigint, suppressed_count bigint, samples jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH missing AS (
    SELECT o.id, o.order_number, o.created_at
    FROM orders_v2 o
    WHERE o.status = 'paid'
      AND o.created_at >= p_since
      AND o.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM payments_v2 p WHERE p.order_id = o.id)
      AND COALESCE(o.meta->>'superseded_by_repair', '') = ''
      AND COALESCE(o.meta->>'no_real_payment', '') = ''
    ORDER BY o.created_at DESC
  ),
  suppressed AS (
    SELECT o.id
    FROM orders_v2 o
    WHERE o.status = 'paid'
      AND o.created_at >= p_since
      AND NOT EXISTS (SELECT 1 FROM payments_v2 p WHERE p.order_id = o.id)
      AND (
        o.meta->>'superseded_by_repair' IS NOT NULL
        OR o.meta->>'no_real_payment' IS NOT NULL
        OR o.user_id IS NULL
      )
  )
  SELECT
    (SELECT count(*) FROM missing)::bigint AS count_total,
    (SELECT count(*) FROM suppressed)::bigint AS suppressed_count,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', id, 'order_number', order_number, 'created_at', created_at))
       FROM (SELECT * FROM missing LIMIT p_limit) s),
      '[]'::jsonb
    ) AS samples;
$$;
