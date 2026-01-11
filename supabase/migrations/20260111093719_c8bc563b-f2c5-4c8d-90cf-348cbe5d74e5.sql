-- Add columns for enhanced bePaid data extraction
ALTER TABLE payment_reconcile_queue 
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS tariff_name TEXT,
ADD COLUMN IF NOT EXISTS matched_product_id UUID REFERENCES products_v2(id),
ADD COLUMN IF NOT EXISTS matched_tariff_id UUID REFERENCES tariffs(id),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bank_code TEXT,
ADD COLUMN IF NOT EXISTS rrn TEXT,
ADD COLUMN IF NOT EXISTS auth_code TEXT;

-- Add index for faster product/tariff lookups
CREATE INDEX IF NOT EXISTS idx_payment_reconcile_queue_matched_product ON payment_reconcile_queue(matched_product_id) WHERE matched_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_reconcile_queue_matched_tariff ON payment_reconcile_queue(matched_tariff_id) WHERE matched_tariff_id IS NOT NULL;