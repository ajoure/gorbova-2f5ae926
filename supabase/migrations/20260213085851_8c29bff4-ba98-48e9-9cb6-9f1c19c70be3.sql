
-- PATCH AR-P0.9.6: Fix subscription_has_payment_token()
-- For MIT: require BOTH credential row AND payment_method_id on subscription
-- For provider_managed: always FALSE (token managed by provider)

CREATE OR REPLACE FUNCTION public.subscription_has_payment_token(p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM subscription_payment_credentials spc
    JOIN subscriptions_v2 s ON s.id = spc.subscription_id
    WHERE spc.subscription_id = p_subscription_id
      AND s.payment_method_id IS NOT NULL
      AND COALESCE(s.billing_type, 'mit') = 'mit'
  )
$$;

COMMENT ON FUNCTION public.subscription_has_payment_token IS 'Check if subscription has a payment token. Returns TRUE only for MIT billing with both credential and linked payment_method. Always FALSE for provider_managed.';
