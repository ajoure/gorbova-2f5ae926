-- Add reject_virtual_cards to tariff_offers
ALTER TABLE public.tariff_offers 
ADD COLUMN IF NOT EXISTS reject_virtual_cards BOOLEAN DEFAULT false;

-- Add card type info to payment_methods
ALTER TABLE public.payment_methods 
ADD COLUMN IF NOT EXISTS card_product TEXT;
ALTER TABLE public.payment_methods 
ADD COLUMN IF NOT EXISTS card_category TEXT;

-- Table for logging rejected card attempts
CREATE TABLE IF NOT EXISTS public.rejected_card_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  offer_id UUID REFERENCES public.tariff_offers(id) ON DELETE SET NULL,
  card_brand TEXT,
  card_last4 TEXT,
  card_product TEXT,
  card_category TEXT,
  reason TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rejected_card_attempts ENABLE ROW LEVEL SECURITY;

-- Admin access policy using role column directly
CREATE POLICY "Admin full access on rejected_card_attempts"
  ON public.rejected_card_attempts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  );

-- Comment for documentation
COMMENT ON COLUMN public.tariff_offers.reject_virtual_cards IS 'Block virtual/prepaid cards for this installment offer';