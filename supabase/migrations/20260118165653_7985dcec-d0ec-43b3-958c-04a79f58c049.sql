
-- Create payment_status_overrides table for CSV reconciliation
CREATE TABLE public.payment_status_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'bepaid',
  uid TEXT NOT NULL,
  status_override TEXT NOT NULL,
  original_status TEXT,
  reason TEXT,
  source TEXT DEFAULT 'csv_import',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, uid)
);

-- Enable RLS
ALTER TABLE public.payment_status_overrides ENABLE ROW LEVEL SECURITY;

-- Only admins can manage overrides
CREATE POLICY "Admins can manage payment status overrides"
  ON public.payment_status_overrides
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create index for fast lookups
CREATE INDEX idx_payment_status_overrides_lookup ON public.payment_status_overrides(provider, uid);

-- Trigger for updated_at
CREATE TRIGGER update_payment_status_overrides_updated_at
  BEFORE UPDATE ON public.payment_status_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.payment_status_overrides IS 'Stores status overrides from CSV reconciliation to correct reporting without modifying payments_v2';
