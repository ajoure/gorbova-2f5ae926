


# План: Добавить кнопку «Ссылка» в FloatingToolbar

## Что нужно сделать

Добавить кнопку с иконкой Link в всплывающую панель форматирования (`FloatingToolbar`). При нажатии — показать inline-поле ввода URL прямо в тулбаре (без `prompt()`), и по Enter/кнопке «OK» обернуть выделенный текст в `<a href="...">`.

## Изменения

**Файл:** `src/components/ui/FloatingToolbar.tsx`

1. Добавить импорт иконки `Link` из `lucide-react`
2. Добавить state `showLinkInput` (boolean) и `linkUrl` (string)
3. Между блоком выравнивания и разделителем (после `Strikethrough`, перед color picker) добавить кнопку «Ссылка» с иконкой `Link`
4. При клике:
   - Сохранить текущее выделение (selection/range) в ref, чтобы не потерять при фокусе на input
   - Показать inline dropdown с полем ввода URL и кнопками «Вставить» / «Убрать ссылку»
5. По нажатию «Вставить» — восстановить selection, вызвать `exec("createLink", url)` — это стандартный `document.execCommand` который оборачивает выделение в `<a>`
6. Кнопка «Убрать ссылку» — `exec("unlink")` для снятия ссылки
7. Увеличить `toolbarWidth` с 320 до ~360 (добавилась одна кнопка)
8. Закрывать `showLinkInput` при закрытии других подменю и при скролле

### Техническая реализация

- `document.execCommand("createLink", false, url)` — оборачивает выделенный текст в `<a href="url">текст</a>`
- `document.execCommand("unlink")` — убирает ссылку
- Selection сохраняется в `useRef<Range | null>` перед открытием input, и восстанавливается перед exec
- Inline input: небольшой dropdown как у цвета/размера, с `<input>` и кнопкой подтверждения

---

# ПОЛНЫЙ АУДИТ ПЛАТЁЖНОЙ СИСТЕМЫ (READ-ONLY) + PATCH PLAN


## Жёсткие правила исполнения для Lovable.dev (применяется к PATCH PLAN)
1) Ничего не ломать и не трогать лишнее; add-only, минимальные правки.
2) Любая операция: **dry-run → подтверждение → execute**.
3) Никаких fuzzy-matching (user+amount+date) без ручного approve.
4) Guard/STOP-conditions обязательны (лимиты батчей, проверки связей, идемпотентность).
5) Безопасность/RBAC: админ-only, view-only не получает лишних действий/уведомлений.
6) Итог по каждому патчу: UI-факт + логи/SQL-пруфы + diff-summary файлов.
7) SYSTEM ACTOR Proof обязателен: audit_logs запись с actor_type='system', actor_user_id=NULL, actor_label заполнен.

---

# AUDIT (READ-ONLY)

## Часть 1 — Паспорт системы (таблицы/поля/flows/writers)

### Основные сущности
- **orders_v2**: создаётся при checkout/link/админских сценариях; статус заказа (pending/paid/refunded/failed).
- **payments_v2**: факт транзакции (provider_payment_id, origin, status, order_id?, profile_id?).
- **payment_reconcile_queue**: сырой вход bePaid (bepaid_uid + description + raw_data/provider_response).
- **subscriptions_v2**: подписка (billing_type, auto_renew, access_end_at, next_charge_at, status).
- **provider_subscriptions**: провайдерская подписка (sbs_*, state, next_charge_at, last_charge_at).
- **entitlements / telegram_access**: доступы (производные от order/subscription логики).
- **tariffs** (+ tariff_prices/features/offers, lesson_price_rules): каноника по тарифам/ценам.
- **products_v2**: каноника продуктов (НЕ таблица `products` — та legacy/пустая).

### Каталог продуктов (VERIFIED)
Каноническая таблица = `products_v2`. Подписки ссылаются на product_id из products_v2:
- `11c9f1b8-...` → **Gorbova Club** (301 подписка)
- `85046734-...` → **Бухгалтерия как бизнес** (34 подписки)
- `9d0d6de8-...` → **Платная консультация** (3 подписки)
- `de36a695-...` → **Подоходный налог ИП** (1 подписка)

### payment_status enum (VERIFIED)
Допустимые значения: `pending | processing | succeeded | failed | refunded | canceled`
Статусов `awaiting` и `redirecting` **НЕ существует** в enum.

---

## Часть 1.5 — Buttons/Rules/Link Generation Layer (VERIFIED)

### Где живёт логика генерации ссылок
- Центр: `supabase/functions/_shared/create-payment-checkout.ts`
- Входные обязательные поля: `user_id`, `product_id`, `tariff_id`, `amount`
- STOP-GUARD: если не хватает обязательных полей — отказ
- Выход: `orders_v2` со `status='pending'`, tracking_id `link:order:{order_uuid}`
- Для link-orders: `order_number = ORD-LINK-{timestamp}` (уникальный по timestamp, **не идемпотентный**)
- **НЕТ проверки** на существующий pending order для user+product+tariff (подтверждено кодом L99-135)

---

## Часть 2 — Классы платежей + «дата перелома» (VERIFIED)

### Два исторических класса
1) **Order-based**: `payments_v2.order_id IS NOT NULL`
2) **Ledger-only / Legacy**: `payments_v2.order_id IS NULL`

### Дата перелома
- **2026-02-01**: внедрение tracking_id `link:order:{uuid}` в webhook.
- После 2026-02-01 для `origin=bepaid` доля `order_id IS NULL` ≈ **3%** (legacy хвост).

---

## Часть 2.5 — Link/Intent → Payment Attempts (VERIFIED) + ПРАВИЛО Attempt ≠ Legacy

### Формальное правило классификации (ОБЯЗАТЕЛЬНО)
**Attempt (link-based):**
- Условие: `payments_v2.order_id IS NOT NULL`
- Статусы Attempt: `failed | processing | pending | succeeded` (в рамках enum `payment_status`)
- UI обязан показывать **Contact + Product** через **order fallback** для всех Attempt статусов.

**Legacy / Ledger-only:**
- Условие: `payments_v2.order_id IS NULL`
- UI: badge `Legacy (без сделки)` + отдельный фильтр/счётчик.

### SQL-пруф Attempt coverage (origin=bepaid, после 2026-02-01)
```text
STATUS       TOTAL   HAS_ORDER   HAS_PROFILE   ORDER_HAS_PROFILE
processing      10        10           9              10
succeeded      172       167          92             167
failed         119       119          27             119
```

Ключевой вывод:
- failed: 100% имеют order_id, но только 23% имели profile_id → **решено F0** (93 записи обогащены, still_missing=0).

---

## Часть 3 — Refund/Void/Cancel: семантика и метрики (VERIFIED)
- В БД есть refund/void записи со status=succeeded и положительным amount.
- Метрики корректны: классификация по transaction_type имеет приоритет, суммы через ABS(), refund/void исключаются из successful.

---

## Часть X — bePaid Description Propagation (VERIFIED)

### Факт
- Description почти всегда есть в `payment_reconcile_queue.description`,
- но не попадает в `payments_v2.meta` и часто отсутствует в `payments_v2.provider_response.transaction.description`.

### SQL-пруф (выборка последних 30)
30/30: `queue_desc` заполнен, `meta_desc = NULL`, `resp_desc = NULL`.

Примеры описаний: "Проверка карты для автоплатежей (будет возвращено)", "Subscription renewal - BUSINESS", "Subscription renewal - CHAT".

**Вывод:** UI читать описание неоткуда → требуется F7.

---

## Часть 4 — Coverage Map путей (VERIFIED + уточнения)

1. **Webhook + tracking_id `link:order:{uuid}`**
   - bepaid-webhook → payment_reconcile_queue → payments_v2(order_id=из tracking) → orders_v2(status=paid) → grant-access-for-order

2. **Webhook без tracking_id (legacy)**
   - payments_v2(order_id NULL) + частичный profile match (card stamp)

3. **Statement sync (CSV)**
   - payments_v2 создаётся/обновляется, order_id только при match

7. **Renewal reminder → link → attempt**
   - subscription-renewal-reminders → create-payment-checkout → orders_v2(pending, ORD-LINK-*)
   - пользователь кликает → bePaid → webhook → payments_v2(order_id из tracking)
   - для failed/processing: profile_id обогащён F0, UI fallback через F8

---

## Часть 5 — Кейс Елена Тельтевская RCA

(Сохранён без изменений из ранее согласованного RCA bundle.)

---

## Часть 5.5 — AutoRenew/Cards/Tokens Source of Truth (VERIFIED) + desync details

### Каноники
- `subscriptions_v2` — приложение
- `provider_subscriptions` — bePaid сторона
- `payment_methods` / `card_profile_links` — токены/связки

### Desync (VERIFIED): active sub, но provider expired/redirecting

```text
#  SUB_ID       USER_EMAIL                       TARIFF          BILLING          PROVIDER_STATE  ACCESS_END_AT         AMOUNT
1  1b06900d...  sm_ulik@mail.ru                  BUSINESS        mit              expired         2026-03-01 08:15 UTC  250.00 BYN
2  4462ee5c...  natapono2018@mail.ru              Ежемесячный     provider_managed expired         2026-03-06 08:58 UTC  250.00 BYN
3  372c8dca...  ekaterina.karalyova@gmail.com     CHAT            mit              redirecting     2026-03-16 12:00 UTC  100.00 BYN
```

Примечание:
- У всех 3: `provider_next_charge_at = NULL`, `last_charge_at = NULL` (provider-side "мёртвая").
- `product_id` у этих подписок найдены в `products_v2` (каноника) — НЕ orphan.

### INV-10 (СНЯТ)
Ранее предполагалось, что product_id orphan — проверка показала, что каноническая таблица = `products_v2`, а не `products`. Все product_id валидны.

---

## Часть 6 — Инварианты (INV-1…INV-9)

- INV-1: payments_v2.provider_payment_id уникален per provider — OK
- INV-2: каждый paid order имеет ≥1 payment — ранее фиксировалось нарушение
- INV-5: refund/void не попадают в доход — OK
- INV-7: после 2026-02-01 origin=bepaid succeeded payments без order ≤ 5% — OK (~3%)
- **INV-9 (NEW):** `subscriptions_v2.status='active'` ⇒ `provider_subscriptions.state IN ('active','paused')` — **НАРУШЕН** (3 кейса, см. Part 5.5)

---

## Часть 6.5 — Timezone/Dates (VERIFIED)

- `nightly-system-health`: `target_tz = body.target_tz || 'Europe/London'` → cron body пустой → всегда London → **F9**.
- `subscription-renewal-reminders`: truth date = `subscriptions_v2.access_end_at` (см. Part 7.6).
- `wasReminderSentToday()`: UTC midnight; на практике дублей не выявлено → Minsk-midnight фикс conditional (F10).

---

## Часть 7 — Cron Jobs

(Перечень сохранён как ранее согласован.)

---

## Часть 7.5 — Уведомления end-to-end (Email + TG) (VERIFIED)

### Важный факт
`subscription-renewal-reminders` пишет напрямую в `telegram_logs`, а **не** в `notification_outbox`.
- Строки 174, 201, 327, 350: прямой `supabase.from('telegram_logs').insert(...)` для всех исходов (skip/fail/success).
- Строки 535-539: `wasReminderSentToday()` проверяет `telegram_logs`, не `notification_outbox`.
- `notification_outbox` **не импортируется и не упоминается** в файле (grep = 0 matches).
- **Вывод:** это **дизайн**, не баг — `notification_outbox` используется другими функциями (`telegram-send-notification`), а renewal reminders работают напрямую.

---

## Часть 7.6 — Reminder Truth Date (CRITICAL, VERIFIED)

Truth date = `subscriptions_v2.access_end_at` (единственный источник).
Не используются: `entitlements.expires_at`, `telegram_access.active_until` как источник планирования.

---

## Часть 8 — DoD-пруфы + Trace Template

### Реальный trace кейс (VERIFIED)

**Subscription:** `8ffade4a-a5b0-4c58-a718-6cb13270bb0d`
- user_id: `4c66871a-c184-4ecd-8555-434852e7ccbb`
- tariff: **FULL** (code=full)
- product: **Gorbova Club** (`11c9f1b8-0355-4753-bd74-40b42aa53616`, найден в `products_v2`)
- billing_type: `mit`, auto_renew: `true`
- access_end_at: `2026-02-26 06:00:18 UTC`
- subscriptions_v2.profile_id: **NULL** (но create-payment-checkout резолвит самостоятельно)

### Reminders (telegram_logs)
```text
DATE         EVENT                    DAYS_LEFT
2026-02-19   subscription_reminder_7d    7
2026-02-23   subscription_reminder_3d    3
2026-02-24   subscription_reminder_3d    3
2026-02-25   subscription_reminder_1d    1
2026-02-26   subscription_reminder_1d    1   ← СЕГОДНЯ
```

5 напоминаний. notification_outbox = 0 записей (подтверждает прямую запись в telegram_logs).

### Orders (из create-payment-checkout)
```text
ORDER_ID                              CREATED       STATUS    ORDER_NUMBER           PROFILE
df61e8d5-8078-4e31-bdd9-ce4df37c8e42  2026-02-26    pending   ORD-LINK-1772085713050   b36758dd (✅)
bfcee60f-66b0-4bbc-9b96-116d97faf4d5  2026-02-25    pending   ORD-LINK-1771999282321   b36758dd (✅)
d0e6559b-29c6-48c4-807e-3e58f3e447f5  2026-02-24    pending   ORD-LINK-1771912876304   b36758dd (✅)
0800b517-1780-4b88-af3f-000b677abe6a  2026-02-23    pending   ORD-LINK-1771826418176   b36758dd (✅)
```

4 pending orders — по одному на reminder. Каждый с полными связями (product, tariff, profile).

### Payments
0 платежей привязаны к этим orders. Пользователь **не кликнул** ни одну ссылку = "intent без action".

### Выводы trace
- Truth date = `access_end_at` — подтверждено
- Каждый reminder безусловно создаёт **новый** pending order (не reuse) → F12
- `subscriptions_v2.profile_id` может быть NULL, но `create-payment-checkout` резолвит profile самостоятельно

### Масштаб pending ORD-LINK (VERIFIED)
- Pending ORD-LINK за 30 дней: **107**
- Уникальных пользователей: **56**
- Пользователей с >3 pending: **1** (4 orders — из trace кейса)

---

# PATCH PLAN (отдельный спринт; не исполнять без согласования)

## Порядок (ФИНАЛЬНЫЙ)
```
F0 → F7 → F8 → F9 → F1+F4 → F3 → F2+F11 → F5 → F12 → F10
```

---

## F0 — Backfill profile_id для Attempt платежей ✅ ВЫПОЛНЕНО

**Цель:** если `payments_v2.profile_id IS NULL`, но `orders_v2.profile_id IS NOT NULL` — скопировать.

**Dry-run SQL:**
```sql
SELECT p.status, count(*) AS cnt
FROM payments_v2 p
JOIN orders_v2 o ON o.id = p.order_id
WHERE p.profile_id IS NULL AND o.profile_id IS NOT NULL
AND p.origin = 'bepaid' AND p.created_at >= '2026-02-01'
AND p.status IN ('failed','processing','pending')
GROUP BY 1 ORDER BY 1;
```

**Dry-run результат:** 93 записи (92 failed + 1 processing)

**Execute SQL:**
```sql
UPDATE payments_v2 p
SET profile_id = o.profile_id
FROM orders_v2 o
WHERE o.id = p.order_id
  AND p.profile_id IS NULL AND o.profile_id IS NOT NULL
  AND p.origin = 'bepaid' AND p.created_at >= '2026-02-01'
  AND p.status IN ('failed','processing','pending');
```

**DoD:** `still_missing = 0` ✅ подтверждено после выполнения.

---

## F7 — Проброс bePaid description: queue → payments.meta → UI

**Проблема подтверждена:** 30/30 cases — queue.description заполнен, payments_v2 пустые.

**Backfill SQL:**
```sql
-- DRY RUN
SELECT count(*) AS to_fill
FROM payments_v2 p
JOIN payment_reconcile_queue q ON q.bepaid_uid = p.provider_payment_id
WHERE q.description IS NOT NULL AND q.description <> ''
  AND (p.meta->>'bepaid_description') IS NULL;

-- EXECUTE
UPDATE payments_v2 p
SET meta = COALESCE(p.meta, '{}'::jsonb) ||
          jsonb_build_object('bepaid_description', q.description)
FROM payment_reconcile_queue q
WHERE q.bepaid_uid = p.provider_payment_id
  AND q.description IS NOT NULL AND q.description <> ''
  AND (p.meta->>'bepaid_description') IS NULL;
```

**Webhook guard:** при записи/обновлении payment — сразу класть description в meta.
**UI:** колонка/tooltip "Описание bePaid" = `meta.bepaid_description` (fallback: `provider_response.transaction.description`).

---

## F8 — UI fallback Contact/Product для Attempt через order

**Правило:**
- Для всех Attempt статусов (`failed | processing | pending | succeeded` с `order_id IS NOT NULL`)
- UI резолвит: `payment.order_id → order.product_id/tariff_id/profile_id → names`
- Legacy (`order_id IS NULL`): badge "Legacy (без сделки)"

---

## F9 — TZ fix nightly-system-health (CONFIRMED)

`Europe/London` → `Europe/Minsk`
Файл: `supabase/functions/nightly-system-health/index.ts`, строка 220.

---

## F1 + F4 — UI badges / filters (Legacy vs Attempt vs Statement)

- **Legacy:** `order_id IS NULL` → badge "Legacy (без сделки)"
- **Attempt:** `order_id IS NOT NULL` + status in Attempt set → badge по статусу
- **Statement sync:** `origin = 'statement_sync'`

---

## F3 — Backfill orders_v2.provider_payment_id (safe)

Для order-based: `payments_v2.order_id → orders_v2.provider_payment_id` (обратная ссылка).

---

## F2 + F11 — Мониторинг инвариантов

- Метрики refund/void guard
- **F11:** desync `active sub` vs `provider expired/redirecting` (3 подтверждённых кейса)
- Алерт: доля `origin=bepaid succeeded` без `order_id` > 5%

---

## F5 — Cleanup 18 test orders

Либо пометить артефактами, либо обогатить из entitlements (по решению).

---

## F12 — Idempotency для renewal-link ORD-LINK orders (NEW)

**Проблема:** каждый reminder создаёт новый pending order; 30 дней: 107 pending ORD-LINK / 56 users.
**Причина:** `create-payment-checkout.ts` (L99-135) INSERT без проверки существующих pending.

**Варианты (выбрать один):**
- A) **Reuse:** если уже есть pending ORD-LINK для `user_id+product_id+tariff_id` за 3 дня → вернуть его `redirect_url`
- B) **Invalidate:** создавать новый, старые пометить `status='superseded'`
- C) **Idempotency key:** `meta.reminder_key = "{user}:{tariff}:{daysLeft}:{YYYY-MM-DD}"` + partial unique index

**DoD:** при повторных reminders за окно — ≤ 1 pending order.

---

## F10 — Minsk midnight для wasReminderSentToday() (CONDITIONAL)

Фиксить только при появлении реальных дублей.

---

## Краткое резюме: что реально меняется в системе

| # | Что | Тип изменения |
|---|-----|--------------|
| F0 | `payments_v2.profile_id` backfill из orders | ✅ Данные (ВЫПОЛНЕНО) |
| F7 | bePaid description → `payments_v2.meta` + UI | Данные + UI |
| F8 | Contact/Product через order fallback для Attempt | UI |
| F9 | TZ `Europe/Minsk` в nightly-system-health | Edge function |
| F1+F4 | Badges Legacy/Attempt/Statement + фильтры | UI |
| F3 | Обратная ссылка `orders_v2.provider_payment_id` | Данные |
| F2+F11 | Мониторинг инвариантов + desync алерт | Edge function |
| F5 | Cleanup test orders | Данные |
| F12 | Idempotency ORD-LINK orders | Edge function |
| F10 | Minsk midnight (conditional) | Edge function |

### НЕ трогаем:
- Бизнес-логику списаний/создания оплат
- Расчёт выручки (доказано корректно)
- Выдачу доступов (кроме UI отображения)
