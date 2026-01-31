# План исправлений: Критические замечания к реализации Nightly мониторинга

## Обзор проблем

После ревизии подтверждены следующие нарушения:

| # | Проблема | Статус | Критичность |
|---|----------|--------|-------------|
| 1 | `bot_token_encrypted` используется напрямую | Архитектурно неверно | 🟠 MEDIUM |
| 2 | `profiles.email` не существует | ❌ НЕ ПОДТВЕРЖДЕНО — колонка есть, владелец найден | ✅ OK |
| 3 | INV-2 "orphan" включает card_verification | Логическая ошибка | 🔴 CRITICAL |
| 4 | INV-10/INV-11: expired active данные | Нужен data fix | 🔴 CRITICAL |
| 5 | INV-12: wrongly_revoked=1 | Нужен regrant | 🟠 MEDIUM |
| 6 | Classification backfill отсутствует | Данные не классифицированы | 🔴 CRITICAL |

---

## PATCH-A: Telegram notify — источник токена

### Текущее состояние
```typescript
// nightly-system-health/index.ts:177-183
const { data: primaryBot } = await supabase
  .from('telegram_bots')
  .select('bot_token_encrypted')
  .eq('is_primary', true)
  .eq('status', 'active')
  .maybeSingle();

Проблема

Хотя bot_token_encrypted содержит реальный токен (формат 8145684416:AAF4...), архитектурно это неверно — токен должен храниться в env secrets, а не читаться из БД.

Решение
	1.	Добавить секрет PRIMARY_TELEGRAM_BOT_TOKEN
	2.	Использовать Deno.env.get('PRIMARY_TELEGRAM_BOT_TOKEN') вместо запроса к БД
	3.	Допускается временный fallback на telegram_bots только при отсутствии env, с обязательным TODO на полное удаление fallback

Файл

supabase/functions/nightly-system-health/index.ts

⸻

PATCH-B: INV-2 “orphan” vs “card_verification”

Текущая проблема

Инвариант INV-2 определяет “orphan” как:

status = 'succeeded' AND amount > 0 AND order_id IS NULL

Это включает записи с transaction_type = 'void' / authorization (card verification), что неверно.

Статистика проблемы

transaction_type	Всего без order	Из них 1 BYN	>1 BYN
Платеж	2222	0	2222
payment	199	139	55
void	100	97	3
refund	10	2	8

Решение

Изменить INV-2 для строгого исключения card_verification:

// INV-2: Orphan payments (исключая card_verification)
const { data: orphans, count: orphanCount } = await supabase
  .from('payments_v2')
  .select(
    'id, provider_payment_id, amount, paid_at, profile_id, transaction_type',
    { count: 'exact' }
  )
  .gte('paid_at', '2026-01-01')
  .eq('status', 'succeeded')
  .gt('amount', 0)
  .not('profile_id', 'is', null)
  .is('order_id', null)
  .not('transaction_type', 'in', '(void,Отмена,authorization_void,authorization)')
  .limit(10);

Файл

supabase/functions/nightly-payments-invariants/index.ts

⸻

PATCH-C: Data fix для INV-10 / INV-11

Проблема
	•	21 entitlements с status='active' и expires_at < NOW()
	•	8 subscriptions с status IN ('active','trial') и access_end_at < NOW()

Решение (SQL, строго dry-run → execute)

Dry-run entitlements

SELECT id, user_id, status, expires_at, product_code
FROM entitlements
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();

Execute entitlements

UPDATE entitlements
SET status = 'expired', updated_at = NOW()
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();

Dry-run subscriptions

SELECT id, user_id, status, access_end_at
FROM subscriptions_v2
WHERE status IN ('active', 'trial')
  AND access_end_at IS NOT NULL
  AND access_end_at < NOW();

Execute subscriptions

UPDATE subscriptions_v2
SET status = 'expired', updated_at = NOW()
WHERE status IN ('active', 'trial')
  AND access_end_at IS NOT NULL
  AND access_end_at < NOW();

Audit (обязательно)

INSERT INTO audit_logs (action, actor_type, actor_label, meta)
VALUES (
  'data_fix.expired_access_statuses',
  'system',
  'nightly-system-health',
  jsonb_build_object(
    'entitlements_fixed', 21,
    'subscriptions_fixed', 8,
    'executed_at', NOW()
  )
);


⸻

PATCH-D: INV-12 wrongly_revoked — regrant

Текущее состояние

RPC rpc_find_wrongly_revoked() возвращает 1 запись:

member_id: b25ebfe7-a6ee-4e6a-8134-4fbe94099f21
full_name: Тест Тестовый
access_status: removed
has_entitlement: true
has_subscription: false

Решение

Выполнить regrant через существующий admin-flow либо прямым UPDATE:

UPDATE telegram_club_members
SET access_status = 'ok', updated_at = NOW()
WHERE id = 'b25ebfe7-a6ee-4e6a-8134-4fbe94099f21';


⸻

PATCH-E: Backfill payment_classification

Проблема

Все 2800+ платежей 2026+ имеют payment_classification = NULL.

Решение

Создать edge-function backfill-payment-classification (batch, без N+1):

const { data: payments } = await supabase
  .from('payments_v2')
  .select(
    'id, status, transaction_type, order_id, is_recurring, is_trial, meta'
  )
  .is('payment_classification', null)
  .gte('created_at', '2026-01-01')
  .limit(500);

for (const p of payments ?? []) {
  const classification = classifyPayment(p);
  await supabase
    .from('payments_v2')
    .update({ payment_classification: classification })
    .eq('id', p.id);
}

DoD

После backfill:
	•	INV-8 переключается в строгий режим: passed = (count === 0)

⸻

PATCH-F: Guard-логика (защита от повторного регресса)

Guards
	1.	entitlements: status='active' ⇒ expires_at IS NULL OR expires_at > NOW()
	2.	subscriptions_v2: status IN ('active','trial') ⇒ access_end_at > NOW()

Пример trigger

CREATE OR REPLACE FUNCTION guard_active_access_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active'
     AND NEW.expires_at IS NOT NULL
     AND NEW.expires_at < NOW() THEN
    RAISE EXCEPTION 'Cannot set active status with expired date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


⸻

Сводка изменяемых файлов

#	Файл	Действие	Приоритет
1	supabase/functions/nightly-system-health/index.ts	Env token + ограниченный fallback	🟠
2	supabase/functions/nightly-payments-invariants/index.ts	Исправление INV-2	🔴
3	SQL entitlements	Data-fix expired	🔴
4	SQL subscriptions	Data-fix expired	🔴
5	SQL telegram_club_members	Regrant wrongly_revoked	🟠
6	backfill-payment-classification	Массовая классификация	🟠
7	SQL triggers	Guard-логика	🟢


⸻

DoD спринта правок
	1.	INV-2 не включает card_verification
	2.	INV-10 count = 0
	3.	INV-11 count = 0
	4.	INV-12 count = 0
	5.	INV-8 становится FAIL при unclassified > 0
	6.	Telegram алерт использует env PRIMARY_TELEGRAM_BOT_TOKEN
	7.	SYSTEM ACTOR proof присутствует в audit_logs для всех data-fix операций

⸻

Примечание по токену

Фактически telegram_bots.bot_token_encrypted содержит незашифрованный токен.
Это вводящее в заблуждение именование.

Архитектурное требование:
	•	основной источник — env secrets
	•	БД не считается безопасным хранилищем токенов
	•	fallback допустим только временно и подлежит удалению

