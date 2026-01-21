-- CRITICAL FIX: Update existing imported records to use origin='bepaid'
-- This ensures they appear in financial summaries that filter on origin='bepaid'

-- Step 1: Update origin for all previously imported bePaid transactions
-- Only update records that were imported from bePaid archive (have import_ref)
UPDATE payments_v2
SET origin = 'bepaid'
WHERE origin = 'import'
  AND import_ref IS NOT NULL
  AND provider = 'bepaid';

-- Step 2: Standardize transaction_type for cancellations
-- 'Отмена' should be stored as 'void' with status 'canceled'
UPDATE payments_v2
SET transaction_type = 'void',
    status = 'canceled'
WHERE (transaction_type ILIKE '%отмен%' OR transaction_type ILIKE '%cancel%' OR transaction_type ILIKE '%void%')
  AND provider = 'bepaid'
  AND transaction_type NOT IN ('void', 'refund');

-- Step 3: Standardize transaction_type for refunds
UPDATE payments_v2
SET transaction_type = 'refund',
    status = 'refunded'
WHERE (transaction_type ILIKE '%возврат%' OR transaction_type ILIKE '%refund%')
  AND provider = 'bepaid'
  AND transaction_type NOT IN ('void', 'refund');