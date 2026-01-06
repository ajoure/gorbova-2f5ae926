-- Add GetCourse offer code field to tariffs table for API integration
ALTER TABLE public.tariffs 
ADD COLUMN IF NOT EXISTS getcourse_offer_code TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tariffs.getcourse_offer_code IS 'GetCourse offer code for API integration when granting access';