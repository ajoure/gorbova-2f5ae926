DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

CREATE POLICY "Service role and admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    ((auth.jwt() ->> 'role') = 'service_role')
    OR has_permission(auth.uid(), 'audit.view'::text)
  );