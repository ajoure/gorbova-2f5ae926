-- PATCH-2: Create RPC function for reliable SQL SUM (idempotent, used by subscription-charge and admin reconcile)
CREATE OR REPLACE FUNCTION public.get_order_expected_paid(p_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM payments_v2
  WHERE order_id = p_order_id
    AND status = 'succeeded'
    AND amount > 0;
$$;

-- Grant execute to authenticated users (for edge functions)
GRANT EXECUTE ON FUNCTION public.get_order_expected_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_expected_paid(uuid) TO service_role;