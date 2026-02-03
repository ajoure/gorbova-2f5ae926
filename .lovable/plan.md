# План: bePaid Provider-Managed Subscriptions (One-Shot Implementation) — FINAL

## Контекст

Добавляем параллельную систему рекуррентных платежей через **bePaid Subscriptions** (provider-managed) для карт с обязательным 3D-Secure (BELKART и др.), которые отклоняют MIT-списания.

**Принцип работы:**
- **MIT (существующая)** — мы сами инициируем списания через `subscription-charge`
- **Provider-managed (новая)** — bePaid автоматически списывает по расписанию, уведомляя нас через webhook

Ключевые гарантии:
- **Security:** webhook без валидной RSA-SHA256 подписи НЕ меняет рабочие таблицы (payments/orders/subscriptions), максимум — запись в orphans.
- **Idempotency:** дедуп строго по `payments_v2(provider, provider_payment_id=txUid)` + отдельная гарантия идемпотентности заказов.
- **Fallback:** только по явному действию пользователя (CTA), без автопереключений.

---

## PATCH-1: База данных — billing_type + provider_subscriptions + orphans + idempotent orders + updated_at

### 1.1. Колонка `billing_type` в `subscriptions_v2`

```sql
ALTER TABLE subscriptions_v2 
ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'mit';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'subscriptions_v2_billing_type_check'
  ) THEN
    ALTER TABLE subscriptions_v2 
    ADD CONSTRAINT subscriptions_v2_billing_type_check 
    CHECK (billing_type IN ('mit', 'provider_managed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_v2_billing_type 
ON subscriptions_v2(billing_type);

COMMENT ON COLUMN subscriptions_v2.billing_type IS 
  'mit = мы сами инициируем списания; provider_managed = bePaid управляет биллингом';

1.2. Ensure set_updated_at() exists (если уже есть — оставить как есть)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

1.3. Таблица provider_subscriptions (источник истины)

CREATE TABLE IF NOT EXISTS public.provider_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider TEXT NOT NULL DEFAULT 'bepaid',
  provider_subscription_id TEXT NOT NULL,

  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_v2_id UUID REFERENCES subscriptions_v2(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  state TEXT NOT NULL DEFAULT 'pending',

  next_charge_at TIMESTAMPTZ,
  last_charge_at TIMESTAMPTZ,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'BYN',
  interval_days INTEGER DEFAULT 30,

  card_brand TEXT,
  card_last4 TEXT,
  card_token TEXT,

  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'provider_subscriptions_unique_provider_id'
  ) THEN
    ALTER TABLE provider_subscriptions 
    ADD CONSTRAINT provider_subscriptions_unique_provider_id 
    UNIQUE (provider, provider_subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_subscription_v2_id 
ON provider_subscriptions(subscription_v2_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_user_id 
ON provider_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_state 
ON provider_subscriptions(state);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_next_charge_at 
ON provider_subscriptions(next_charge_at);

ALTER TABLE provider_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access' AND tablename = 'provider_subscriptions') THEN
    CREATE POLICY "Service role full access" ON provider_subscriptions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can read' AND tablename = 'provider_subscriptions') THEN
    CREATE POLICY "Admins can read" ON provider_subscriptions
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own subscriptions' AND tablename = 'provider_subscriptions') THEN
    CREATE POLICY "Users see own subscriptions" ON provider_subscriptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_provider_subscriptions_updated_at') THEN
    CREATE TRIGGER set_provider_subscriptions_updated_at
      BEFORE UPDATE ON provider_subscriptions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

1.4. Таблица provider_webhook_orphans (для неизвестных/невалидных webhook’ов)

CREATE TABLE IF NOT EXISTS public.provider_webhook_orphans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'bepaid',
  provider_subscription_id TEXT,
  provider_payment_id TEXT,
  reason TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orphans_created_at 
ON provider_webhook_orphans(created_at);

CREATE INDEX IF NOT EXISTS idx_orphans_processed 
ON provider_webhook_orphans(processed) WHERE NOT processed;

ALTER TABLE provider_webhook_orphans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access' AND tablename = 'provider_webhook_orphans') THEN
    CREATE POLICY "Service role full access" ON provider_webhook_orphans
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can read' AND tablename = 'provider_webhook_orphans') THEN
    CREATE POLICY "Admins can read" ON provider_webhook_orphans
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_provider_webhook_orphans_updated_at') THEN
    CREATE TRIGGER set_provider_webhook_orphans_updated_at
      BEFORE UPDATE ON provider_webhook_orphans
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

1.5. Idempotency для orders_v2 (обязательная гарантия от дублей)

Вариант A (рекомендуется, add-only): добавить поля и уникальный индекс.

ALTER TABLE orders_v2 
ADD COLUMN IF NOT EXISTS provider TEXT,
ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

-- Уникальность только когда оба поля заданы
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_v2_provider_payment_unique
ON orders_v2(provider, provider_payment_id)
WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL;

1.6. Проверка unique index на payments_v2

Ожидаем, что уже существует: UNIQUE(provider, provider_payment_id) (или индекс с WHERE provider_payment_id IS NOT NULL).

DoD (PATCH-1):
	•	Миграции проходят без ошибок (в т.ч. если set_updated_at отсутствовала).
	•	provider_subscriptions и provider_webhook_orphans созданы + RLS + triggers.
	•	idx_orders_v2_provider_payment_unique существует.
	•	SELECT count(*) FROM subscriptions_v2 WHERE billing_type='provider_managed' работает.

⸻

PATCH-2: Edge Function — bepaid-create-subscription

Путь: supabase/functions/bepaid-create-subscription/index.ts

Логика:
	1.	Auth: только authenticated user.
	2.	Проверить, что subscription_v2_id принадлежит auth.uid().
	3.	Получить настройки из tariff_offers.meta.recurring (interval_days=30 по умолчанию).
	4.	Сумма: tariff_offers.auto_charge_amount (приоритет) или subscriptions_v2.meta.recurring_amount.
	5.	Создать подписку в bePaid API:
	•	notification_url: /functions/v1/bepaid-webhook
	•	return_url: /settings/payment-methods?bepaid_sub=success
	•	tracking_id: subv2:{subscription_v2_id} (только для диагностики, не для security)
	6.	Upsert в provider_subscriptions (по UNIQUE provider+provider_subscription_id).
	7.	Update subscriptions_v2.billing_type='provider_managed' (и можно сохранить bepaid_subscription_id в meta как доп. удобство).
	8.	Audit log: bepaid.subscription.create (SYSTEM ACTOR).
	9.	Вернуть redirect_url.

RBAC/Security:
	•	Никаких admin-полномочий пользователю.
	•	Не логировать PII.

DoD:
	•	audit_logs: action=bepaid.subscription.create, actor_type=system, actor_user_id=NULL
	•	запись в provider_subscriptions создана/обновлена
	•	subscriptions_v2.billing_type = provider_managed
	•	пользователь получает redirect_url и реально проходит bePaid flow

⸻

PATCH-3: Edge Function — bepaid-cancel-subscription (RBAC жёстко)

Путь: supabase/functions/bepaid-cancel-subscription/index.ts (или расширение существующего)

Вход:
	•	user-mode: { provider_subscription_id } (или { subscription_v2_id })
	•	admin-mode: те же поля, но проверка роли

RBAC:
	•	User cancel: только provider_subscriptions.user_id = auth.uid()
	•	Admin cancel: только если has_role(auth.uid(),'admin')

После отмены:
	1.	вызвать bePaid cancel API
	2.	provider_subscriptions.state='canceled'
	3.	subscriptions_v2.auto_renew=false (и статус/next_charge_at при необходимости)
	4.	Audit log: bepaid.subscription.cancel (SYSTEM ACTOR)

DoD:
	•	state сменился
	•	auto_renew=false
	•	audit_logs SYSTEM ACTOR
	•	пользователь не может отменить чужую подписку (403)

⸻

PATCH-4: Webhook — Security (no fallback), Parsing fix, Orphans

Файл: supabase/functions/bepaid-webhook/index.ts

4.1. Security правило (обязательное)
	•	Если verifyWebhookSignature() FAIL → HTTP 401.
	•	Никаких “fallback по tracking_id” для изменения рабочих данных.
	•	Допустимо: записать в provider_webhook_orphans с reason='invalid_signature' (raw payload), и вернуть 401.

4.2. Robust payload parsing (исправлено)

function extractSubscriptionData(body: any) {
  let subscriptionId: string | null = null;

  if (body?.subscription?.id) subscriptionId = body.subscription.id;
  else if (typeof body?.id === 'string' && body.id.startsWith('sbs_')) subscriptionId = body.id;
  else if (body?.subscription_id) subscriptionId = body.subscription_id;

  const txUid =
    body?.transaction?.uid ||
    body?.last_transaction?.uid ||
    body?.payment?.uid ||
    null;

  const state =
    body?.subscription?.state ||
    body?.state ||
    body?.status ||
    'unknown';

  return { subscriptionId, txUid, state };
}

4.3. Orphan handling (subscription not found)
	•	Если подпись валидна, но provider_subscriptions по provider_subscription_id не найден:
	•	записать в provider_webhook_orphans (reason=subscription_not_found)
	•	вернуть 200 {status:'queued_orphan'}

DoD:
	•	invalid signature → 401 и НЕ меняет payments/orders/subscriptions
	•	неизвестный subscription_id → orphans (reason=subscription_not_found)
	•	записи orphans читаются админом

⸻

PATCH-5: Webhook Renewal Handler — fully idempotent (orders + payments + extend)

Ключ: txUid = transaction.uid — глобальный ключ дедупа.

5.1. Idempotent order (через новые поля orders_v2)
	•	Сначала пробуем найти/создать order по UNIQUE (provider='bepaid', provider_payment_id=txUid):
	•	insert order с этими полями
	•	если UNIQUE conflict → выбрать существующий order_id

5.2. Idempotent payment
	•	Upsert payments_v2 по (provider='bepaid', provider_payment_id=txUid):
	•	НЕ использовать .single() после upsert; использовать .select().maybeSingle() и обрабатывать ошибки.
	•	если неожиданно 0 строк/много строк → записать orphan (reason=payment_upsert_unexpected_result) и вернуть 200, без продления доступа.

5.3. Extend access_end_at (правильно)
	•	База продления: base = max(now(), access_end_at)
	•	newEnd = base + interval_days

5.4. Update provider_subscriptions
	•	last_charge_at / next_charge_at / state / card_brand / card_last4

5.5. Audit log
	•	bepaid.subscription.webhook.renewal (SYSTEM ACTOR), meta содержит:
	•	provider_subscription_id, txUid, order_id, payment_id, interval_days, amount

5.6. Notifications
	•	Только после успешной фиксации order + payment + access_end_at.

DoD:
	•	повторный webhook с тем же txUid не создаёт новый order (UNIQUE доказательство)
	•	повторный webhook не создаёт дубль payments_v2
	•	access_end_at увеличивается ровно 1 раз на txUid
	•	audit_logs SYSTEM ACTOR присутствует

⸻

PATCH-6: subscription-charge — Skip provider_managed + CTA on MIT rejection (без автосвитча)

Файл: supabase/functions/subscription-charge/index.ts

6.1. Skip provider_managed

if (subscription.billing_type === 'provider_managed') {
  return {
    subscription_id: subscription.id,
    success: true,
    skipped: true,
    skip_reason: 'provider_managed',
  };
}

6.2. CTA on MIT rejection (P.4011–P.4015)
	•	При ошибках P.4011–P.4015:
	1.	payment_methods.verification_status='rejected'
	2.	отправить TG/email CTA на страницу настроек
	3.	НЕТ автоматического создания provider subscription

DoD:
	•	provider_managed не чарджится
	•	rejected фиксируется и уведомление уходит
	•	автопереключения нет

⸻

PATCH-7: UI — User Settings + Admin Views (исправлен product_name)

7.1. User: /settings/payment-methods

Query: брать provider_subscriptions + join до продукта через subscriptions_v2 -> products_v2(name).

Отображать:
	•	продукт: products_v2.name
	•	card_brand/last4
	•	next_charge_at + amount

Кнопки:
	•	“Изменить карту” = cancel текущую + create новую (редирект)
	•	“Отменить” = cancel

7.2. Admin: AutoRenewals Tab

Колонка “Биллинг”:
	•	provider_managed → 🔄 bePaid
	•	mit → 💳 MIT

7.3. Admin: Contact Card

Секция provider subscriptions:
	•	provider_subscription_id, state, next_charge_at, card
	•	кнопка cancel (admin)

7.4. Admin: Orphans View (опционально)

Таблица по provider_webhook_orphans:
	•	created_at, reason, provider_subscription_id, provider_payment_id, processed flag

DoD:
	•	UI-скрины из 7500084@gmail.com
	•	user видит/отменяет только свои provider_subscriptions (RLS proof)
	•	admin видит billing_type и секции

⸻

SQL Proof (после внедрения)

-- 1) Дубликатов payments_v2 нет
SELECT provider, provider_payment_id, count(*)
FROM payments_v2
WHERE provider='bepaid' AND provider_payment_id IS NOT NULL
GROUP BY 1,2
HAVING count(*) > 1;

-- 2) Дубликатов orders_v2 нет (новая гарантия)
SELECT provider, provider_payment_id, count(*)
FROM orders_v2
WHERE provider='bepaid' AND provider_payment_id IS NOT NULL
GROUP BY 1,2
HAVING count(*) > 1;

-- 3) Provider subscriptions живые
SELECT state, count(*)
FROM provider_subscriptions
WHERE provider='bepaid'
GROUP BY 1;

-- 4) SYSTEM ACTOR Proof
SELECT action, actor_type, actor_user_id, actor_label, created_at
FROM audit_logs
WHERE action IN (
  'bepaid.subscription.create',
  'bepaid.subscription.webhook.renewal',
  'bepaid.subscription.cancel'
)
ORDER BY created_at DESC
LIMIT 20;
-- actor_type='system', actor_user_id IS NULL


⸻

Порядок реализации

#	Патч	Риск	Файлы
1	DB: billing_type + tables + orders idempotency + set_updated_at	Низкий	Migration
2	Edge: bepaid-create-subscription	Средний	New function
3	Edge: bepaid-cancel-subscription + RBAC	Низкий	Extend/new
4	Webhook: security NO fallback + parsing fix + orphans	Средний	bepaid-webhook/index.ts
5	Webhook: renewal handler fully idempotent	Средний	bepaid-webhook/index.ts
6	Charges: skip + CTA	Низкий	subscription-charge/index.ts
7	UI: User + Admin + Orphans	Низкий	TSX files


⸻

Технические ограничения и решения

Ограничение	Решение
bePaid интервал в днях	В UI “каждые 30 дней”, interval_days хранить явно
Webhook может прийти многократно/параллельно	UNIQUE на payments + UNIQUE на orders + осторожная обработка результатов
Invalid signature	401 + (опционально) запись только в orphans, без рабочих изменений
Отмена подписки необратима	Для возобновления — создать новую
MIT→provider	Только по CTA, без автосвитча
Enum статусов	Использовать реальные значения из схемы payment_status (не придумывать новые)

