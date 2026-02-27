-- F13.ADD.ADDON P2: RPC for bulk fill order_id from payment_reconcile_queue
CREATE OR REPLACE FUNCTION public.fill_order_from_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filled integer;
BEGIN
  UPDATE payments_v2 p
  SET order_id = q.matched_order_id
  FROM payment_reconcile_queue q
  WHERE p.provider = 'bepaid'
    AND p.provider_payment_id = q.bepaid_uid
    AND p.order_id IS NULL
    AND q.matched_order_id IS NOT NULL;

  GET DIAGNOSTICS filled = ROW_COUNT;
  RETURN filled;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_order_from_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fill_order_from_queue() TO service_role;