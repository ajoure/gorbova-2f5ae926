-- Clean up duplicate orphans: keep only the latest row per (provider, provider_payment_id)
DELETE FROM public.provider_webhook_orphans
WHERE id NOT IN (
  SELECT DISTINCT ON (provider, provider_payment_id) id
  FROM public.provider_webhook_orphans
  WHERE provider_payment_id IS NOT NULL
  ORDER BY provider, provider_payment_id, created_at DESC
)
AND provider_payment_id IS NOT NULL;

-- Now create the unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_orphans_provider_payment_unique 
ON public.provider_webhook_orphans(provider, provider_payment_id) 
WHERE provider_payment_id IS NOT NULL;