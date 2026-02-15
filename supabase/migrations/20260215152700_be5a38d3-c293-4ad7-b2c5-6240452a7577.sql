
-- ============================================================
-- Fix ALL RLS policies where admin is checked but super_admin is NOT
-- Super admin should have ALL permissions that admin has (and more)
-- ============================================================

-- 1. ai_prompt_packages
DROP POLICY IF EXISTS "Admins can view prompt packages" ON ai_prompt_packages;
CREATE POLICY "Admins can view prompt packages" ON ai_prompt_packages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update non-system packages" ON ai_prompt_packages;
CREATE POLICY "Admins can update non-system packages" ON ai_prompt_packages FOR UPDATE
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) AND (is_system IS NULL OR is_system = false));

DROP POLICY IF EXISTS "Admins can delete non-system packages" ON ai_prompt_packages;
CREATE POLICY "Admins can delete non-system packages" ON ai_prompt_packages FOR DELETE
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) AND (is_system IS NULL OR is_system = false));

-- 2. bepaid_statement_rows
DROP POLICY IF EXISTS "Admins can read bepaid_statement_rows" ON bepaid_statement_rows;
CREATE POLICY "Admins can read bepaid_statement_rows" ON bepaid_statement_rows FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update bepaid_statement_rows" ON bepaid_statement_rows;
CREATE POLICY "Admins can update bepaid_statement_rows" ON bepaid_statement_rows FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can delete bepaid_statement_rows" ON bepaid_statement_rows;
CREATE POLICY "Admins can delete bepaid_statement_rows" ON bepaid_statement_rows FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 3. bepaid_sync_logs
DROP POLICY IF EXISTS "Admins can view sync logs" ON bepaid_sync_logs;
CREATE POLICY "Admins can view sync logs" ON bepaid_sync_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 4. document_templates
DROP POLICY IF EXISTS "Admins can view document templates" ON document_templates;
CREATE POLICY "Admins can view document templates" ON document_templates FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update document templates" ON document_templates;
CREATE POLICY "Admins can update document templates" ON document_templates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can delete document templates" ON document_templates;
CREATE POLICY "Admins can delete document templates" ON document_templates FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 5. email_inbox
DROP POLICY IF EXISTS "Admins can view all emails" ON email_inbox;
CREATE POLICY "Admins can view all emails" ON email_inbox FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update emails" ON email_inbox;
CREATE POLICY "Admins can update emails" ON email_inbox FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can delete emails" ON email_inbox;
CREATE POLICY "Admins can delete emails" ON email_inbox FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 6. email_logs
DROP POLICY IF EXISTS "Admins can view all email logs" ON email_logs;
CREATE POLICY "Admins can view all email logs" ON email_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 7. email_threads
DROP POLICY IF EXISTS "Admins can view email threads" ON email_threads;
CREATE POLICY "Admins can view email threads" ON email_threads FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update email threads" ON email_threads;
CREATE POLICY "Admins can update email threads" ON email_threads FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 8. entitlement_orders
DROP POLICY IF EXISTS "Admins can manage entitlement_orders" ON entitlement_orders;
CREATE POLICY "Admins can manage entitlement_orders" ON entitlement_orders FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 9. payment_reconcile_queue
DROP POLICY IF EXISTS "Admins can manage payment reconcile queue" ON payment_reconcile_queue;
CREATE POLICY "Admins can manage payment reconcile queue" ON payment_reconcile_queue FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 10. payment_reconcile_queue_archive
DROP POLICY IF EXISTS "Admins can view payment archive" ON payment_reconcile_queue_archive;
CREATE POLICY "Admins can view payment archive" ON payment_reconcile_queue_archive FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 11. payment_status_overrides
DROP POLICY IF EXISTS "Admins can manage payment status overrides" ON payment_status_overrides;
CREATE POLICY "Admins can manage payment status overrides" ON payment_status_overrides FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 12. payments_sync_runs
DROP POLICY IF EXISTS "Admin read payments_sync_runs" ON payments_sync_runs;
CREATE POLICY "Admin read payments_sync_runs" ON payments_sync_runs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admin update payments_sync_runs" ON payments_sync_runs;
CREATE POLICY "Admin update payments_sync_runs" ON payments_sync_runs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 13. product_document_templates
DROP POLICY IF EXISTS "Admins can view product document templates" ON product_document_templates;
CREATE POLICY "Admins can view product document templates" ON product_document_templates FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update product document templates" ON product_document_templates;
CREATE POLICY "Admins can update product document templates" ON product_document_templates FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can delete product document templates" ON product_document_templates;
CREATE POLICY "Admins can delete product document templates" ON product_document_templates FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 14. provider_subscriptions
DROP POLICY IF EXISTS "Admins can read provider_subscriptions" ON provider_subscriptions;
CREATE POLICY "Admins can read provider_subscriptions" ON provider_subscriptions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 15. provider_webhook_orphans
DROP POLICY IF EXISTS "Admins can read provider_webhook_orphans" ON provider_webhook_orphans;
CREATE POLICY "Admins can read provider_webhook_orphans" ON provider_webhook_orphans FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 16. scrape_logs
DROP POLICY IF EXISTS "Admins can view scrape logs" ON scrape_logs;
CREATE POLICY "Admins can view scrape logs" ON scrape_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 17. telegram_messages (CRITICAL - this is the "mark as read" fix)
DROP POLICY IF EXISTS "Admins can view all telegram messages" ON telegram_messages;
CREATE POLICY "Admins can view all telegram messages" ON telegram_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "Admins can update telegram messages" ON telegram_messages;
CREATE POLICY "Admins can update telegram messages" ON telegram_messages FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- 18. Storage policies - avatars (legacy user_roles table)
DROP POLICY IF EXISTS "Admins can delete avatars" ON storage.objects;
CREATE POLICY "Admins can delete avatars" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS "Admins can manage avatars" ON storage.objects;
CREATE POLICY "Admins can manage avatars" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

-- 19. Storage - signatures
DROP POLICY IF EXISTS "Admins can delete signatures" ON storage.objects;
CREATE POLICY "Admins can delete signatures" ON storage.objects FOR DELETE
  USING (bucket_id = 'signatures' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS "Admins can update signatures" ON storage.objects;
CREATE POLICY "Admins can update signatures" ON storage.objects FOR UPDATE
  USING (bucket_id = 'signatures' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

-- 20. Storage - tariff-media
DROP POLICY IF EXISTS "Admins can delete tariff media" ON storage.objects;
CREATE POLICY "Admins can delete tariff media" ON storage.objects FOR DELETE
  USING (bucket_id = 'tariff-media' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS "Admins can read tariff media" ON storage.objects;
CREATE POLICY "Admins can read tariff media" ON storage.objects FOR SELECT
  USING (bucket_id = 'tariff-media' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

-- 21. Storage - documents
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;
CREATE POLICY "Admins can manage all documents" ON storage.objects FOR ALL
  USING (bucket_id = 'documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)))
  WITH CHECK (bucket_id = 'documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

-- 22. Storage - documents-templates
DROP POLICY IF EXISTS "Admins can manage document templates" ON storage.objects;
CREATE POLICY "Admins can manage document templates" ON storage.objects FOR ALL
  USING (bucket_id = 'documents-templates' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)))
  WITH CHECK (bucket_id = 'documents-templates' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

-- 23. edge_functions_registry (was using legacy direct query)
DROP POLICY IF EXISTS "superadmin_select_edge_functions_registry" ON edge_functions_registry;
CREATE POLICY "superadmin_select_edge_functions_registry" ON edge_functions_registry FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
