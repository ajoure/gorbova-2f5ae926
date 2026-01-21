-- Fix NULL paid_at records that poison bePaid sync (UID_MISMATCH errors)
-- These are admin manual charges, failed payment attempts, or pending orders
-- Their provider_payment_id is internal UUID, not bePaid transaction.uid

UPDATE payments_v2
SET origin = 'manual_adjustment',
    updated_at = now()
WHERE provider = 'bepaid'
  AND origin = 'bepaid'
  AND paid_at IS NULL;

-- Add comment explaining origin values
COMMENT ON COLUMN payments_v2.origin IS 
  'bepaid=real webhook confirmed tx, import=CSV/archive import, manual_adjustment=admin charges/pending/failed attempts';