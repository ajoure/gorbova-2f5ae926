
CREATE OR REPLACE FUNCTION public.receipt_backfill_candidates(
  p_origin text DEFAULT 'bepaid',
  p_cutoff timestamptz DEFAULT now() - interval '2 days',
  p_cursor_created_at timestamptz DEFAULT '1970-01-01T00:00:00Z'::timestamptz,
  p_cursor_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  p_limit int DEFAULT 100
)
RETURNS TABLE(id uuid, provider_payment_id text, receipt_url text, created_at timestamptz, meta jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.provider_payment_id, p.receipt_url, p.created_at, p.meta
  FROM payments_v2 p
  WHERE p.origin = p_origin
    AND p.status = 'succeeded'
    AND p.provider_payment_id IS NOT NULL
    AND p.receipt_url IS NULL
    AND p.created_at < p_cutoff
    AND coalesce((p.meta->>'receipt_backfill_attempts')::int, 0) < 3
    AND (p.created_at > p_cursor_created_at
         OR (p.created_at = p_cursor_created_at AND p.id > p_cursor_id))
  ORDER BY p.created_at ASC, p.id ASC
  LIMIT p_limit;
$$;
