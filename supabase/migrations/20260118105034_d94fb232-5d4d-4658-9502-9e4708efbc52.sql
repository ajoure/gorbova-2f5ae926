-- Insert product "Бухгалтерия как бизнес"
INSERT INTO products_v2 (
  code,
  name,
  slug,
  public_title,
  public_subtitle,
  currency,
  is_active,
  status,
  meta
) VALUES (
  'buh_business',
  'Бухгалтерия как бизнес',
  'business-training',
  'Бухгалтерия как бизнес',
  'Ежемесячный тренинг по построению бухгалтерского бизнеса',
  'BYN',
  true,
  'active',
  '{"is_recurring": true, "recurring_type": "monthly"}'::jsonb
);

-- Insert tariff for the product
INSERT INTO tariffs (
  product_id,
  code,
  name,
  description,
  period_label,
  access_days,
  is_active,
  is_popular,
  meta
)
SELECT 
  id,
  'monthly',
  'Ежемесячный доступ',
  '1 тренинг в месяц + доступ к архиву материалов',
  'BYN/мес',
  30,
  true,
  true,
  '{"is_recurring": true}'::jsonb
FROM products_v2 
WHERE code = 'buh_business';

-- Insert offer (payment option) for the tariff
INSERT INTO tariff_offers (
  tariff_id,
  offer_type,
  button_label,
  amount,
  is_active,
  is_primary,
  payment_method,
  requires_card_tokenization,
  meta
)
SELECT 
  t.id,
  'pay_now',
  'Записаться — 250 BYN/мес',
  250,
  true,
  true,
  'full_payment',
  true,
  '{
    "is_recurring": true,
    "currency": "BYN",
    "recurring_interval_days": 30,
    "charge_window_start": 1,
    "charge_window_end": 3
  }'::jsonb
FROM tariffs t
JOIN products_v2 p ON t.product_id = p.id
WHERE p.code = 'buh_business' AND t.code = 'monthly';