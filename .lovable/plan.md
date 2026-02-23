
# Исправление проблем здоровья системы (INV-19B + INV-20)

## Диагноз

### INV-19B: "Token recurring без provider_subscriptions" — 125 найдено

**Из 125 записей:**
- **123** — подписки с `billing_type = mit`. Они управляются платформой (token-based charging), а НЕ BePaid. У них по определению нет записи в `provider_subscriptions`, и это **нормально**. Инвариант INV-19B считает их ошибкой, но это **ложноположительное срабатывание**.
- **3** — подписки с `billing_type = provider_managed`. Эти действительно должны иметь запись в `provider_subscriptions`, но её нет. Это реальная проблема.

**Причина**: запрос в `nightly-payments-invariants` (строки 143-174) фильтрует по `auto_renew = true` и наличию `payment_methods`, но **не исключает** подписки с `billing_type = mit`. MIT-подписки не нуждаются в `provider_subscriptions` — они списывают по токену напрямую.

**Исправление**: добавить фильтр в INV-19B, чтобы проверять только `billing_type IN ('provider_managed')` или хотя бы исключить `mit`.

### INV-20: "Оплаченные заказы без платежей" — 4 найдено

Проверены все 4 заказа:

| Заказ | Причина | Решение |
|---|---|---|
| `b8d7b867` (ORD-26-MLUXHRPN) | Legacy-дубликат: bepaid_uid `9cc19de5` привязан к платежу другого заказа `fa019f5a` | Пометить `superseded_by_repair` |
| `c0af8ad4` (ORD-26-MKDNM34Z) | Legacy-дубликат: bepaid_uid `6303b5a2` привязан к платежу другого заказа `1ea274b1` | Пометить `superseded_by_repair` |
| `cb92d748` (REN-26-40888f51) | Backfill-артефакт: `meta.payment_id = caf2d8ed` не существует в `payments_v2` | Пометить `no_real_payment` |
| `02302928` (ORD-ADM-1769114549787) | 3DS redirect с `reconciled_by`, но платёж не найден нигде | Пометить `superseded_by_repair` (reconciled) |

Все 4 можно исправить запуском `admin-repair-missing-payments` в режиме **execute** — функция уже содержит логику для каждого из этих случаев.

---

## План исправления

### P1 — Исправить INV-19B: убрать ложные срабатывания для MIT-подписок

**Файл:** `supabase/functions/nightly-payments-invariants/index.ts`

**Строки 143-148:** Добавить фильтр `billing_type`:

Было:
```text
.in("status", ["active", "trial", "past_due"])
.eq("auto_renew", true)
```

Станет:
```text
.in("status", ["active", "trial", "past_due"])
.eq("auto_renew", true)
.in("billing_type", ["provider_managed"])
```

Это уберет 123 ложных срабатывания. Останутся только 3 реальные проблемы (provider_managed без записи в provider_subscriptions).

### P2 — Исправить INV-20: запустить repair для 4 заказов

**Действие:** вызвать edge function `admin-repair-missing-payments` с `dry_run: false`.

Функция уже обрабатывает все 4 случая:
- UID collision (2 заказа с bepaid_uid, привязанным к другому заказу) -- пометит `superseded_by_repair`
- Backfill artifact (1 заказ с `source: subscription-renewal` + `backfill: true`) -- пометит `no_real_payment`
- Reconciled order (1 заказ с `reconciled_by`) -- пометит `superseded_by_repair`

### P3 — Для 3 реальных INV-19B (provider_managed): запустить backfill

**Действие:** вызвать edge function `admin-bepaid-backfill-subscriptions` для синхронизации 3 provider_managed подписок с BePaid API.

---

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `supabase/functions/nightly-payments-invariants/index.ts` | Добавить `.in("billing_type", ["provider_managed"])` в запрос INV-19B (строка 147) |

## Операционные действия (после деплоя)

1. Вызвать `admin-repair-missing-payments` с `{ dry_run: false, since_days: 90 }` -- исправит INV-20
2. Вызвать `admin-bepaid-backfill-subscriptions` с `{ dry_run: false }` -- исправит 3 реальных INV-19B
3. Запустить проверку здоровья повторно -- ожидаем 0 проблем

## DoD

1. INV-19B показывает 3 или 0 (не 125) после деплоя
2. INV-20 показывает 0 после запуска repair
3. SQL-пруф: все 4 заказа имеют флаги `superseded_by_repair` или `no_real_payment`
4. Нет ошибок сборки Edge Function
