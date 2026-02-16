
-- RPC for INV-20: accurate count of paid orders without payments_v2
CREATE OR REPLACE FUNCTION public.inv20_paid_orders_without_payments(
  p_since timestamptz,
  p_limit int DEFAULT 10
)
RETURNS TABLE(count_total bigint, samples jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH missing AS (
    SELECT o.id, o.order_number, o.created_at
    FROM orders_v2 o
    WHERE o.status = 'paid'
      AND o.created_at >= p_since
      AND NOT EXISTS (SELECT 1 FROM payments_v2 p WHERE p.order_id = o.id)
    ORDER BY o.created_at DESC
  )
  SELECT
    (SELECT count(*) FROM missing)::bigint AS count_total,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('order_number', m.order_number, 'created_at', m.created_at))
       FROM (SELECT * FROM missing LIMIT p_limit) m),
      '[]'::jsonb
    ) AS samples;
$$;
