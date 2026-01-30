# План: Исправление расхождения суммы платежей (1 BYN → 100 BYN) — УТОЧНЁННЫЙ И КОРРЕКТНЫЙ

## Диагноз подтверждён

Проблема сформулирована корректно. Это **не bePaid и не trial как таковой**, а **ошибка сохранения и синхронизации суммы** внутри нашей системы.

Выявлены **ДВЕ реальные корневые причины**, которые полностью объясняют наблюдаемое поведение.

---

## Корневая причина 1: Неверный `recurring_amount` при создании подписки

**Файл:** `supabase/functions/grant-access-for-order/index.ts`  
**Текущая логика (ошибочная):**
```ts
recurring_amount: order.final_price

При trial-заказе order.final_price = 1 BYN, и эта сумма:
	•	сохраняется в meta подписки,
	•	далее используется как источник суммы при автосписании,
	•	и «заражает» все последующие платежи.

❗ Это ошибка модели данных, а не edge-case.

⸻

Корневая причина 2: Webhook bePaid не обновляет amount

Файл: supabase/functions/bepaid-webhook/index.ts

Webhook:
	•	получает реальную сумму в transaction.amount,
	•	но не пишет её в payments_v2.amount,
	•	в результате в БД остаётся старая сумма (1 BYN), взятая при создании платежа.

❗ Это нарушает принцип bePaid = source of truth.

⸻

Финальное решение: 2 обязательных патча (оба нужны)

ПАТЧ 1 (КРИТИЧЕСКИЙ): bePaid → payments_v2.amount

Файл: supabase/functions/bepaid-webhook/index.ts

Изменение: всегда синхронизировать сумму из ответа bePaid

const basePaymentUpdate: Record<string, any> = {
  provider_payment_id: transactionUid || paymentV2.provider_payment_id || null,
  provider_response: body,
  error_message: transaction?.message || null,
  card_brand: transaction?.credit_card?.brand || paymentV2.card_brand || null,
  card_last4: transaction?.credit_card?.last_4 || paymentV2.card_last4 || null,
  receipt_url: transaction?.receipt_url || paymentV2.receipt_url || null,

  // PATCH 1: source of truth — bePaid
  ...(transaction?.amount != null
    ? { amount: transaction.amount / 100 }
    : {}),
};

Эффект:
Фактическая сумма платежа всегда равна реально списанной в bePaid, независимо от trial / order / подписки.

⸻

ПАТЧ 2 (КРИТИЧЕСКИЙ): корректный recurring_amount для trial

Файл: supabase/functions/grant-access-for-order/index.ts

Правильная логика:
	•	order.final_price — только для trial
	•	recurring_amount — ТОЛЬКО из auto_charge_offer

let recurringAmount = order.final_price;

if (order.is_trial && order.offer_id) {
  const { data: trialOffer } = await supabase
    .from('tariff_offers')
    .select('auto_charge_offer_id')
    .eq('id', order.offer_id)
    .maybeSingle();

  if (trialOffer?.auto_charge_offer_id) {
    const { data: fullOffer } = await supabase
      .from('tariff_offers')
      .select('amount')
      .eq('id', trialOffer.auto_charge_offer_id)
      .maybeSingle();

    if (fullOffer?.amount) {
      recurringAmount = fullOffer.amount;
    }
  }
}

meta: {
  recurring_amount: recurringAmount,
  recurring_currency: order.currency || 'BYN',
}

Эффект:
Новые подписки никогда больше не создаются с recurring_amount = 1.

⸻

Обязательный data-fix для существующих данных

1. Подписки (recurring_amount)

UPDATE subscriptions_v2 s
SET meta = jsonb_set(
  COALESCE(s.meta, '{}'::jsonb),
  '{recurring_amount}',
  to_jsonb(tp.final_price)
)
FROM tariff_prices tp
WHERE tp.tariff_id = s.tariff_id
  AND tp.is_active = true
  AND s.auto_renew = true
  AND (s.meta->>'recurring_amount')::numeric <= 5;

2. Платежи (amount) — ВАЖНО

Для платежей, где сумма уже пришла из bePaid, но записана как 1 BYN:
	•	либо переиграть webhook по provider_payment_id,
	•	либо сделать backfill из provider_response.transaction.amount.

⸻

Что принципиально НЕ делаем

❌ Guard’ы amount <= 5 как основное решение
❌ UI-костыли
❌ Блокировки списаний
❌ Подмена суммы из order / тарифа после факта оплаты

Это всё маскировка симптомов, а не лечение.

⸻

Критерии готовности (DoD)
	1.	payments_v2.amount всегда равен bePaid.transaction.amount / 100
	2.	Trial-подписки создаются с корректным recurring_amount
	3.	Нет новых платежей с суммой 1 BYN при автосписании
	4.	Старые подписки и платежи приведены в порядок
	5.	Аудит/отчёты начинают показывать реальные деньги

⸻

Итог

План годный, правильный и достаточный.
Это ровно то место, где была ошибка.
После этих двух патчей проблема закрывается навсегда, а не «приглушается».

Если нужно — следующим шагом можно оформить это как жёсткое ТЗ для Lovable с DoD и запретом на альтернативные реализации.

