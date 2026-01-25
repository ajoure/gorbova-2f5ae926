-- PATCH-1: FIX RLS telegram_logs
-- Проблема: политика TO service_role не матчится с JWT role в Edge Functions
-- Решение: TO public + auth.role() = 'service_role'

-- Удалить неработающую политику
DROP POLICY IF EXISTS "service_role_full_access_telegram_logs" ON public.telegram_logs;
DROP POLICY IF EXISTS "service_role_insert_telegram_logs" ON public.telegram_logs;

-- Создать правильную политику (TO public + проверка JWT auth.role())
CREATE POLICY "service_role_full_access_telegram_logs"
ON public.telegram_logs
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');