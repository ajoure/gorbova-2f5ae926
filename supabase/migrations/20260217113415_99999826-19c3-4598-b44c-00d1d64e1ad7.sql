-- Add UPDATE policy for admin/super_admin on provider_subscriptions
-- This is the root cause of "link saves but doesn't persist" bug

DROP POLICY IF EXISTS "Admins can update provider_subscriptions" ON public.provider_subscriptions;

CREATE POLICY "Admins can update provider_subscriptions"
  ON public.provider_subscriptions
  FOR UPDATE
  USING (
    public.has_role_v2(auth.uid(), 'admin')
    OR public.has_role_v2(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_role_v2(auth.uid(), 'admin')
    OR public.has_role_v2(auth.uid(), 'super_admin')
  );