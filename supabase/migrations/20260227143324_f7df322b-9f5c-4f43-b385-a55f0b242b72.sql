-- PATCH RENEWAL+PAYMENTS.1 D: Diagnostic RPC — find payments_v2 without order_id
CREATE OR REPLACE FUNCTION public.find_unlinked_payments(p_limit integer DEFAULT 50)
RETURNS TABLE(
  payment_id uuid,
  provider_payment_id text,
  amount numeric,
  paid_at timestamptz,
  created_at timestamptz,
  origin text,
  payment_flow text,
  tracking_id text,
  has_tracking_id boolean,
  potential_order_id uuid,
  match_source text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS payment_id,
    p.provider_payment_id,
    p.amount,
    p.paid_at,
    p.created_at,
    p.origin,
    (p.meta->>'payment_flow')::text AS payment_flow,
    (p.meta->>'tracking_id')::text AS tracking_id,
    (p.meta->>'tracking_id' IS NOT NULL) AS has_tracking_id,
    COALESCE(o.id, q.matched_order_id) AS potential_order_id,
    CASE 
      WHEN o.id IS NOT NULL THEN 'orders_v2.provider_payment_id'
      WHEN q.matched_order_id IS NOT NULL THEN 'queue.matched_order_id'
      ELSE NULL
    END AS match_source
  FROM payments_v2 p
  LEFT JOIN orders_v2 o ON o.provider_payment_id = p.provider_payment_id
  LEFT JOIN payment_reconcile_queue q ON q.bepaid_uid = p.provider_payment_id AND q.matched_order_id IS NOT NULL
  WHERE p.provider = 'bepaid'
    AND p.provider_payment_id IS NOT NULL
    AND p.order_id IS NULL
  ORDER BY p.paid_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Security: only service_role can execute
REVOKE ALL ON FUNCTION public.find_unlinked_payments(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_unlinked_payments(integer) TO service_role;