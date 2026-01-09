-- Fix overly permissive RLS policies that use USING (true) for write operations
-- These policies should only allow service_role to perform these operations

-- 1. Fix 'orders' table - drop and recreate with proper service_role check
DROP POLICY IF EXISTS "Service can update orders" ON public.orders;
CREATE POLICY "Service role can update orders" ON public.orders
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- 2. Fix 'telegram_access_audit' table
DROP POLICY IF EXISTS "Service role can insert audit records" ON public.telegram_access_audit;
-- No policy needed - service role key bypasses RLS

-- 3. Fix 'tg_daily_summaries' table  
DROP POLICY IF EXISTS "System can manage daily summaries" ON public.tg_daily_summaries;
-- No policy needed - service role key bypasses RLS

-- 4. Fix 'tg_chat_messages' table
DROP POLICY IF EXISTS "System can insert chat messages" ON public.tg_chat_messages;
-- No policy needed - service role key bypasses RLS

-- 5. Fix 'installment_payments' table
DROP POLICY IF EXISTS "System can update installments" ON public.installment_payments;
CREATE POLICY "Service role can update installments" ON public.installment_payments
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- 6. Fix 'telegram_logs' table
DROP POLICY IF EXISTS "System can insert telegram logs" ON public.telegram_logs;
-- No policy needed - service role key bypasses RLS