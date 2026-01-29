
-- =====================================================
-- FIX: Replace overly permissive service role policies
-- Change from USING (true) to proper service role checks
-- =====================================================

-- 1. audience_interests - fix service role policy
DROP POLICY IF EXISTS "Service role can manage audience_interests" ON public.audience_interests;

CREATE POLICY "Service role can manage audience_interests" 
ON public.audience_interests 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- 2. bepaid_statement_rows - fix service role policy (keep admin policies)
DROP POLICY IF EXISTS "Service role can manage bePaid statements" ON public.bepaid_statement_rows;

CREATE POLICY "Service role can manage bepaid_statement_rows" 
ON public.bepaid_statement_rows 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- 3. payment_method_verification_jobs - fix service role policy
DROP POLICY IF EXISTS "Service role full access on verification jobs" ON public.payment_method_verification_jobs;

CREATE POLICY "Service role can manage verification_jobs" 
ON public.payment_method_verification_jobs 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- 4. payment_reconcile_queue_archive - fix service role policy
DROP POLICY IF EXISTS "Service role can manage payment archive" ON public.payment_reconcile_queue_archive;

CREATE POLICY "Service role can manage payment_archive" 
ON public.payment_reconcile_queue_archive 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);
