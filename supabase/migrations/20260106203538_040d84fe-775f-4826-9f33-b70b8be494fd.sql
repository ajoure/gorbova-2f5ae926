-- Add getcourse_offer_id to tariff_offers
ALTER TABLE public.tariff_offers
ADD COLUMN IF NOT EXISTS getcourse_offer_id text;

-- Add comment
COMMENT ON COLUMN public.tariff_offers.getcourse_offer_id IS 'GetCourse offer ID for automatic access provisioning';