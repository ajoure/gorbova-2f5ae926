
-- Add unique constraint on entitlements for upsert to work
ALTER TABLE public.entitlements 
ADD CONSTRAINT entitlements_user_id_product_code_key UNIQUE (user_id, product_code);

-- Create product_club_mappings for existing products
-- Map CHAT product to test club (30 days)
INSERT INTO public.product_club_mappings (product_id, club_id, duration_days, is_active)
VALUES 
  ('4c6b7175-4cc8-44d2-a44f-e51c298d6485', 'f63aa7b2-b980-435e-9219-c7e6a0bd1795', 30, true),
  ('097e5da0-34cb-4b67-80cd-694c66b80f34', 'f63aa7b2-b980-435e-9219-c7e6a0bd1795', 30, true),
  ('0c100186-1225-41e1-8f50-a9eacbd73d1d', 'f63aa7b2-b980-435e-9219-c7e6a0bd1795', 30, true)
ON CONFLICT DO NOTHING;
