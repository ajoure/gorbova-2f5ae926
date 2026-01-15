-- Create unique index on bepaid_uid for upsert operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_reconcile_queue_bepaid_uid 
ON public.payment_reconcile_queue(bepaid_uid) 
WHERE bepaid_uid IS NOT NULL;