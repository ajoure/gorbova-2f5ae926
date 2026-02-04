PATCH: Критическая безопасность — «доступ выдан без оплаты» + падение checkout

Краткое резюме проблем

#	Проблема	Критичность	Статус
1	Тестовая кнопка доступна всем admin (не только super_admin) в PaymentDialog	🔴 SECURITY	Требует фикса
2	bepaid-create-subscription-checkout падает из-за NOT NULL (base_price, final_price, is_trial)	🔴 BLOCKER	Требует фикса
3	Тестовая кнопка в AdminOrdersV2 уже ограничена isSuperAdmin()	✅ OK	Не требует фикса
4	test-payment-complete на сервере уже проверяет super_admin	✅ OK	Не требует фикса


⸻

PATCH-5 (BLOCKER): Исправить NOT NULL в bepaid-create-subscription-checkout

Текущее состояние (строки 281-299)

.insert({
  user_id: userId,
  profile_id: profileId,
  product_id: productId,
  tariff_id: tariff.id,
  offer_id: effectiveOfferId || null,
  order_number: orderNumber,
  paid_amount: amountCents / 100,  // ← НЕВЕРНО: paid_amount до оплаты
  currency,
  status: 'pending',
  meta: { ... },
})

Проблема

Схема orders_v2 требует NOT NULL поля:
	•	base_price — отсутствует
	•	final_price — отсутствует
	•	is_trial — отсутствует

Дополнительно: paid_amount не должен быть равен сумме до реальной оплаты (должен быть 0).

Исправление

const amountMoney = amountCents / 100;

.insert({
  user_id: userId,
  profile_id: profileId,
  product_id: productId,
  tariff_id: tariff.id,
  offer_id: effectiveOfferId || null,
  order_number: orderNumber,
  
  // NOT NULL fields
  base_price: amountMoney,
  final_price: amountMoney,
  is_trial: false,
  
  // До webhook paid_amount = 0
  paid_amount: 0,
  
  currency,
  status: 'pending',
  meta: {
    payment_flow: 'provider_managed_checkout',
    source: 'bepaid-create-subscription-checkout',
    expected_amount: amountMoney,  // Для сверки в webhook
  },
})

Файл

supabase/functions/bepaid-create-subscription-checkout/index.ts, строки 281-299

⸻

PATCH-6 (SECURITY): Ограничить тестовую кнопку в PaymentDialog

Текущее состояние

Строка 583 (проверка в handleTestPayment):

if (!isSuperAdmin() && !isAdmin()) {
  toast.error("Только администраторы могут использовать эту функцию");
  return;
}

Строки 1187-1208 (отображение кнопки):

{(isSuperAdmin() || isAdmin()) && (
  <div className="border-t pt-4 mt-4">
    <Button ... onClick={handleTestPayment}>
      Тест: Симулировать оплату (только для админов)
    </Button>
  </div>
)}

Проблема

Кнопка доступна всем admin, а не только super_admin.
В отличие от AdminOrdersV2, где уже есть isSuperAdmin() проверка.

Исправление (минимальный безопасный вариант)

// Строка 583
if (!isSuperAdmin()) {
  toast.error("Только super admin может использовать эту функцию");
  return;
}

// Строки 1187-1188
{isSuperAdmin() && (

Файл

src/components/payment/PaymentDialog.tsx, строки 583-586 и 1187-1188

⸻

PATCH-7 (SECURITY): Проверить отсутствие fallback в test-payment

Текущее состояние

Проанализировав код в PaymentDialog.tsx (строки 582-684):
	1.	handleTestPayment сначала вызывает bepaid-create-token для создания заказа
	2.	Затем вызывает test-payment-complete для симуляции

Проверка (что уже ОК)
	•	test-payment-complete уже проверяет super_admin на сервере (строки 158-172)
	•	При ошибке bepaid-create-token выбрасывается исключение (строка 616-620), и test-payment-complete не вызывается
	•	Явного fallback “если checkout упал → test-payment” нет

Рекомендация

Нет необходимости в изменениях. Достаточно PATCH-6 (UI) + существующего server-guard.

⸻

Сводка файлов для изменений

Файл	Действие	Строки
supabase/functions/bepaid-create-subscription-checkout/index.ts	Добавить base_price, final_price, is_trial, изменить paid_amount: 0	281-299
src/components/payment/PaymentDialog.tsx	Заменить isAdmin() на isSuperAdmin()	583, 1187-1188


⸻

DoD (Definition of Done)

После PATCH-5

-- Новые provider_managed заказы должны иметь корректные поля
SELECT id, order_number, status, base_price, final_price, is_trial, paid_amount,
       meta->>'payment_flow' as flow
FROM orders_v2
WHERE meta->>'payment_flow' = 'provider_managed_checkout'
ORDER BY created_at DESC LIMIT 5;

-- Ожидаемый результат:
-- status = 'pending', base_price > 0, final_price > 0, is_trial = false, paid_amount = 0

После PATCH-6
	•	UI: Тестовая кнопка видна только super_admin (не admin)
	•	При попытке вызова endpoint напрямую без super_admin → 403

Edge Function Logs

После деплоя bepaid-create-subscription-checkout:
	•	Ошибка null value in column "base_price" больше не появляется
	•	Checkout создаёт заказ и возвращает redirect_url

⸻

Порядок выполнения
	1.	PATCH-5 — Исправить base_price/final_price/is_trial/paid_amount в bepaid-create-subscription-checkout
	2.	PATCH-6 — Ограничить тестовую кнопку только isSuperAdmin() в PaymentDialog
	3.	Deploy Edge Function
	4.	Тест: Попробовать bePaid subscription checkout → должен создаться заказ и редирект
	5.	Проверка SQL: Заказ в orders_v2 со статусом pending, корректными ценами