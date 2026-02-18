
-- Fix search_path mutable warning for get_db_now
CREATE OR REPLACE FUNCTION public.get_db_now()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT now()::timestamptz::text $$;
