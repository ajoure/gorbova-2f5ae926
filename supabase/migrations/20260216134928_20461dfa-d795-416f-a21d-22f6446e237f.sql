
-- 1. telegram_access_queue: добавить политику для admin/super_admin
CREATE POLICY "Admins can manage telegram_access_queue"
ON public.telegram_access_queue
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 2. ai_prompt_packages
DROP POLICY IF EXISTS "Admins can create prompt packages" ON public.ai_prompt_packages;
CREATE POLICY "Admins can create prompt packages"
ON public.ai_prompt_packages FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 3. bepaid_statement_rows
DROP POLICY IF EXISTS "Admins can insert bepaid_statement_rows" ON public.bepaid_statement_rows;
CREATE POLICY "Admins can insert bepaid_statement_rows"
ON public.bepaid_statement_rows FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 4. document_templates
DROP POLICY IF EXISTS "Admins can create document templates" ON public.document_templates;
CREATE POLICY "Admins can create document templates"
ON public.document_templates FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 5. email_inbox
DROP POLICY IF EXISTS "Admins can insert emails" ON public.email_inbox;
CREATE POLICY "Admins can insert emails"
ON public.email_inbox FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 6. email_logs
DROP POLICY IF EXISTS "Admins can insert email logs" ON public.email_logs;
CREATE POLICY "Admins can insert email logs"
ON public.email_logs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 7. email_threads
DROP POLICY IF EXISTS "Admins can insert email threads" ON public.email_threads;
CREATE POLICY "Admins can insert email threads"
ON public.email_threads FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 8. payments_sync_runs
DROP POLICY IF EXISTS "Admin insert payments_sync_runs" ON public.payments_sync_runs;
CREATE POLICY "Admin insert payments_sync_runs"
ON public.payments_sync_runs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 9. product_document_templates
DROP POLICY IF EXISTS "Admins can create product document templates" ON public.product_document_templates;
CREATE POLICY "Admins can create product document templates"
ON public.product_document_templates FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 10. telegram_messages
DROP POLICY IF EXISTS "Admins can insert telegram messages" ON public.telegram_messages;
CREATE POLICY "Admins can insert telegram messages"
ON public.telegram_messages FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);
