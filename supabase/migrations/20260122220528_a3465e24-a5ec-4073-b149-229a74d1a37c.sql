-- =====================================================
-- PATCH: Recurring Card Verification Queue System
-- =====================================================

-- A1. Extend payment_methods with verification fields
ALTER TABLE payment_methods
ADD COLUMN IF NOT EXISTS recurring_verified BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_error TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_checked_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_tx_uid TEXT DEFAULT NULL;

COMMENT ON COLUMN payment_methods.recurring_verified IS 
  'True = passed test charge without 3DS. False = requires 3DS each time. NULL = not tested.';
COMMENT ON COLUMN payment_methods.verification_status IS 
  'pending | verified | rejected | failed | refund_pending';
COMMENT ON COLUMN payment_methods.verification_error IS 
  'Error message if verification failed or was rejected';
COMMENT ON COLUMN payment_methods.verification_checked_at IS 
  'Timestamp when verification was last attempted';
COMMENT ON COLUMN payment_methods.verification_tx_uid IS 
  'bePaid transaction UID from test charge';

-- A2. Create verification jobs queue table
CREATE TABLE IF NOT EXISTS payment_method_verification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  idempotency_key TEXT NOT NULL,
  charge_tx_uid TEXT DEFAULT NULL,
  refund_tx_uid TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_verification_idempotency_key UNIQUE(idempotency_key),
  CONSTRAINT valid_verification_status CHECK (status IN ('pending', 'processing', 'done', 'failed', 'rate_limited'))
);

-- Indexes for worker efficiency
CREATE INDEX IF NOT EXISTS idx_verification_jobs_pending 
ON payment_method_verification_jobs(status, next_retry_at) 
WHERE status IN ('pending', 'rate_limited');

CREATE INDEX IF NOT EXISTS idx_verification_jobs_payment_method
ON payment_method_verification_jobs(payment_method_id);

-- RLS: service role only
ALTER TABLE payment_method_verification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on verification jobs"
ON payment_method_verification_jobs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_verification_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_verification_jobs_updated_at ON payment_method_verification_jobs;
CREATE TRIGGER trigger_verification_jobs_updated_at
BEFORE UPDATE ON payment_method_verification_jobs
FOR EACH ROW
EXECUTE FUNCTION update_verification_jobs_updated_at();