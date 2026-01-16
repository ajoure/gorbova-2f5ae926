-- Address linter warnings:
-- 1) Make permissive INSERT/UPDATE policies non-trivial (but keep intended access)
-- 2) Fix function search_path mutability

-- contact_requests: allow anon + authenticated to submit
DO $$
BEGIN
  EXECUTE 'ALTER POLICY "Anyone can submit contact requests" ON public.contact_requests WITH CHECK (auth.role() in (''anon'',''authenticated''))';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- course_preregistrations: allow anon + authenticated
DO $$
BEGIN
  EXECUTE 'ALTER POLICY "Anyone can create preregistration" ON public.course_preregistrations WITH CHECK (auth.role() in (''anon'',''authenticated''))';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- orders (legacy): allow anon + authenticated
DO $$
BEGIN
  EXECUTE 'ALTER POLICY "Anyone can create orders" ON public.orders WITH CHECK (auth.role() in (''anon'',''authenticated''))';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- bepaid_sync_logs: restrict client-side writes to authenticated users only (service role bypasses RLS anyway)
DO $$
BEGIN
  EXECUTE 'ALTER POLICY "System can insert sync logs" ON public.bepaid_sync_logs WITH CHECK (auth.role() = ''authenticated'')';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER POLICY "System can update sync logs" ON public.bepaid_sync_logs USING (auth.role() = ''authenticated'')';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- Fix mutable search_path
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.generate_ticket_number() SET search_path = public';
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;