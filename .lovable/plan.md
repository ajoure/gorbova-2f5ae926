# План: Гарантированное исправление проблемы суммы списаний (1 BYN → 100/150/250)

## Результаты исследования

### Ответы на контрольные вопросы

**Вопрос 1: Сохраняется ли `provider_response` с `transaction.amount`?**

✅ **ДА.** Webhook сохраняет полный body в `provider_response`.
Проверено в БД — 40 записей имеют `provider_response.transaction.amount = 100` при `amount = 1`.
Backfill возможен без API-запросов к bePaid.

**Вопрос 2: Где создаётся `payments_v2` для renewal?**

В `subscription-charge/index.ts` — запись создаётся ДО отправки в bePaid с предварительно рассчитанной суммой.
После успешного charge обновляется статус и `provider_response`, но **amount НЕ перезаписывается**.

**Вопрос 3: Признак trial в `orders_v2`?**

`orders_v2.is_trial` — основной признак. Код `getRecurringAmount` опирается только на `order.is_trial` — это корректно.

---

## Диагностика: Почему патч webhook не работает

Webhook обновляет `payments_v2` по `provider_payment_id` (bePaid UID).
Но для **рекуррентных** платежей (subscription-charge) обновление происходит в самой функции — и там amount НЕ синхронизируется.

---

## Решение: 4 патча + 1 улучшение

### ПАТЧ 1: Синхронизация amount в subscription-charge (КРИТИЧЕСКИЙ)

**Файл:** `supabase/functions/subscription-charge/index.ts`

**Проблема:** Update после успешного charge НЕ включает amount.

**Исправление:** Добавить `amount: chargeResult.transaction.amount / 100` в update после успешного charge.

---

### ПАТЧ 1.5: Трекинг источника суммы в INSERT payments_v2 (НОВОЕ)

**Файл:** `supabase/functions/subscription-charge/index.ts`

**Место:** При INSERT payments_v2 (до charge)

**Добавить в meta:**
```typescript
meta: {
  amount_source: amountSource,
  calculated_amount: amount,
  recurring_amount: subMeta?.recurring_amount,
}
```

Это даёт полную прозрачность: откуда взялась сумма, какая была рассчитана, какая в подписке.

---

### ПАТЧ 2: Guard для non-trial с amount ≤ 5 BYN

**Файл:** `supabase/functions/subscription-charge/index.ts`

**Логика:**
```typescript
if (!is_trial && amount <= 5) {
  // Логировать в audit_logs
  // Вернуть { success: false, blocked: true, error: '...' }
}
```

---

### ПАТЧ 3: Suspicious downgrade audit в webhook

**Файл:** `supabase/functions/bepaid-webhook/index.ts`

**Логика:** Если `oldAmount > newAmount` и разница > 5 BYN — логировать в `audit_logs`.

---

### ПАТЧ 4: Backfill существующих неверных payments_v2

**SQL-скрипт:** Исправить `amount` из `provider_response.transaction.amount` для 40 записей.

---

## Изменяемые файлы

| # | Файл | Изменение |
|---|------|-----------|
| 1 | `supabase/functions/subscription-charge/index.ts` | Добавить `amount` в update после успешного charge |
| 1.5 | `supabase/functions/subscription-charge/index.ts` | Добавить `amount_source`, `calculated_amount`, `recurring_amount` в meta при INSERT |
| 2 | `supabase/functions/subscription-charge/index.ts` | Добавить guard для `amount ≤ 5` + `is_trial=false` |
| 3 | `supabase/functions/bepaid-webhook/index.ts` | Добавить audit log для downgrade |
| 4 | SQL-скрипт | Backfill из `provider_response.transaction.amount` |

---

## Критерии готовности (DoD)

1. **После успешного рекуррентного charge:** `payments_v2.amount` = `chargeResult.transaction.amount / 100`
2. **При INSERT payments_v2:** `meta` содержит `amount_source`, `calculated_amount`, `recurring_amount`
3. **Guard работает:** Попытка charge non-trial с `amount ≤ 5` блокируется и логируется
4. **Webhook защита:** Подозрительный downgrade суммы логируется в `audit_logs`
5. **Backfill выполнен:** Все 40 записей исправлены
6. **Нет регрессий:** Trial 1 BYN проходит, renewal 100/150/250 корректно сохраняется

---

## Порядок внедрения

| # | Патч | Критичность | Эффект |
|---|------|-------------|--------|
| 1 | Amount sync в subscription-charge | 🔴 КРИТИЧЕСКИЙ | Исправляет корень проблемы для новых renewals |
| 1.5 | Meta трекинг в INSERT | 🟢 ПОЛЕЗНО | Прозрачность источника суммы |
| 2 | Guard ≤5 BYN | 🟠 ВЫСОКАЯ | Safety-net для edge cases |
| 3 | Webhook audit | 🟡 СРЕДНЯЯ | Диагностика для внешних платежей |
| 4 | Backfill | 🟠 ВЫСОКАЯ | Исправляет исторические данные |
