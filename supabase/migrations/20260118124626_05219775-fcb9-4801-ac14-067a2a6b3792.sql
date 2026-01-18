-- Drop old constraint and add new one with preregistration type
ALTER TABLE tariff_offers DROP CONSTRAINT tariff_offers_offer_type_check;

ALTER TABLE tariff_offers ADD CONSTRAINT tariff_offers_offer_type_check 
CHECK (offer_type = ANY (ARRAY['pay_now'::text, 'trial'::text, 'preregistration'::text]));

-- Update existing pay_now button with preregistration meta settings
UPDATE tariff_offers 
SET meta = jsonb_set(
  COALESCE(meta, '{}'),
  '{preregistration}',
  '{
    "first_charge_date": "2026-02-05",
    "notify_before_days": 1,
    "auto_convert_after_date": false
  }'::jsonb
)
WHERE id = '88c6f10d-a0c6-47f3-9d90-980b3a86fe1c';

-- Create a dedicated preregistration button for buh_business
INSERT INTO tariff_offers (
  tariff_id, 
  offer_type, 
  button_label, 
  amount, 
  requires_card_tokenization, 
  is_active, 
  is_primary,
  sort_order,
  meta
) VALUES (
  'c5981337-242b-49e8-8c99-64ccf8fac13e',
  'preregistration',
  'Забронировать место',
  0,
  true,
  true,
  false,
  5,
  '{
    "preregistration": {
      "first_charge_date": "2026-02-05",
      "charge_offer_id": "88c6f10d-a0c6-47f3-9d90-980b3a86fe1c",
      "notify_before_days": 1,
      "auto_convert_after_date": false,
      "charge_window_start": 1,
      "charge_window_end": 4
    }
  }'::jsonb
) ON CONFLICT DO NOTHING;