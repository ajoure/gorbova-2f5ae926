-- ============================================
-- ОТЗ vFinal: Фаза 1-5 DB миграции
-- ============================================

-- ФАЗА 1.1: Добавить колонки (ADD-ONLY)
ALTER TABLE payments_v2 ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE subscriptions_v2 ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS external_id_gc text;

-- ФАЗА 1.2: Индексы
CREATE INDEX IF NOT EXISTS idx_payments_v2_profile_id ON payments_v2(profile_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_profile_id ON entitlements(profile_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_order_id ON entitlements(order_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_v2_profile_id ON subscriptions_v2(profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_external_id_gc ON profiles(external_id_gc);

-- ФАЗА 2.1: Backfill payments_v2.profile_id
UPDATE payments_v2 pay SET profile_id = p.id
FROM profiles p
WHERE pay.profile_id IS NULL AND p.user_id = pay.user_id;

UPDATE payments_v2 pay SET profile_id = pay.user_id
WHERE pay.profile_id IS NULL
  AND EXISTS (SELECT 1 FROM profiles WHERE id = pay.user_id);

-- ФАЗА 2.2: Backfill entitlements.profile_id + order_id
UPDATE entitlements e SET profile_id = p.id
FROM profiles p
WHERE e.profile_id IS NULL AND p.user_id = e.user_id;

UPDATE entitlements e SET order_id = (e.meta->>'order_id')::uuid
WHERE e.order_id IS NULL
  AND e.meta->>'order_id' IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders_v2 WHERE id = (e.meta->>'order_id')::uuid);

UPDATE entitlements e SET order_id = (e.meta->>'legacy_order_id')::uuid
WHERE e.order_id IS NULL
  AND e.meta->>'legacy_order_id' IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders_v2 WHERE id = (e.meta->>'legacy_order_id')::uuid);

-- ФАЗА 2.3: Backfill subscriptions_v2.profile_id
UPDATE subscriptions_v2 s SET profile_id = p.id
FROM profiles p
WHERE s.profile_id IS NULL AND p.user_id = s.user_id;

-- ФАЗА 4: FK constraints (NOT VALID сначала)
ALTER TABLE payments_v2 ADD CONSTRAINT fk_payments_v2_profile
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE entitlements ADD CONSTRAINT fk_entitlements_profile
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE entitlements ADD CONSTRAINT fk_entitlements_order
  FOREIGN KEY (order_id) REFERENCES orders_v2(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE subscriptions_v2 ADD CONSTRAINT fk_subscriptions_v2_profile
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL NOT VALID;

-- VALIDATE constraints
ALTER TABLE payments_v2 VALIDATE CONSTRAINT fk_payments_v2_profile;
ALTER TABLE entitlements VALIDATE CONSTRAINT fk_entitlements_profile;
ALTER TABLE entitlements VALIDATE CONSTRAINT fk_entitlements_order;
ALTER TABLE subscriptions_v2 VALIDATE CONSTRAINT fk_subscriptions_v2_profile;

-- ФАЗА 5: Unique index для идемпотентности платежей
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_v2_provider_payment
ON payments_v2(provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;