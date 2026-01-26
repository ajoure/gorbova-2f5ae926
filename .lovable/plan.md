# План: Исправление токенизации карт для recurring-платежей без 3DS

## Проблема

При ручном списании с привязанной карты bePaid возвращает ошибку P.4011 (требуется 3D-Secure), хотя карта уже была привязана с прохождением 3DS.

**Причина:** При токенизации карты не указывается `contract: ["recurring"]`, поэтому банк не знает, что карта предназначена для автоматических списаний.

---

## Решение

### Шаг 1: Исправить токенизацию карты

**Файл:** `supabase/functions/payment-methods-tokenize/index.ts`

Добавить `additional_data.contract: ["recurring"]` в запрос токенизации:

```typescript
// Строки 104-126 - изменить checkoutData:
const checkoutData = {
  checkout: {
    test: testMode,
    transaction_type: 'tokenization',
    order: {
      amount: tokenizationAmountSafe,
      currency,
      description: 'Card tokenization for recurring payments',
    },
    settings: {
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notification_url: `${supabaseUrl}/functions/v1/payment-methods-webhook`,
      language: 'ru',
    },
    customer: {
      email: user.email,
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
    },
    // ДОБАВИТЬ: указываем что карта будет использоваться для recurring
    additional_data: {
      contract: ['recurring'],
    },
  },
};
```

---

### Шаг 2: Исправить функцию списания

**Файл:** `supabase/functions/admin-manual-charge/index.ts`

Добавить `card_on_file.initiator: "merchant"` в запрос списания (строки 110-124):

```typescript
const chargePayload = {
  request: {
    amount: amountKopecks,
    currency,
    description,
    tracking_id: trackingId,
    test: testMode,
    credit_card: {
      token: paymentToken,
    },
    additional_data: {
      contract: ['recurring', 'unscheduled'],
      // ДОБАВИТЬ: указываем что это merchant-initiated transaction
      card_on_file: {
        initiator: 'merchant',
        type: 'delayed_charge',
      },
    },
  },
};
```

---

### Шаг 3: Обработка карт, привязанных ДО исправления

Карты, которые были привязаны без `contract: ["recurring"]`, могут продолжать требовать 3DS. Для таких случаев:

1. **Добавить флаг в payment_methods** - колонка `supports_recurring` (boolean)
2. **При новой привязке** - устанавливать `supports_recurring = true`
3. **При списании** - проверять флаг и выводить понятное сообщение для старых карт:
   - "Эта карта была привязана до обновления системы. Попросите клиента перепривязать карту для автоматических списаний."

**SQL миграция:**
```sql
ALTER TABLE payment_methods 
ADD COLUMN IF NOT EXISTS supports_recurring BOOLEAN DEFAULT false;

-- Помечаем все существующие карты как НЕ поддерживающие recurring
COMMENT ON COLUMN payment_methods.supports_recurring IS 
  'true if card was tokenized with recurring contract, allowing merchant-initiated charges without 3DS';
```

---

### Шаг 4: Обновить webhook для сохранения флага

**Файл:** `supabase/functions/payment-methods-webhook/index.ts`

При сохранении новой карты устанавливать `supports_recurring = true`:

```typescript
// Строка 287-305 - добавить supports_recurring: true
const { error: insertError } = await supabase
  .from('payment_methods')
  .insert({
    user_id: userId,
    provider: 'bepaid',
    provider_token: cardToken,
    brand: cardBrand,
    last4: cardLast4,
    exp_month: cardExpMonth,
    exp_year: cardExpYear,
    is_default: isFirstCard,
    status: 'active',
    card_product: cardProduct,
    card_category: cardCategory,
    supports_recurring: true,  // ДОБАВИТЬ
    meta: {
      tracking_id: trackingId,
      transaction_id: transaction.uid,
    },
  });
```

---

### Шаг 5: Улучшить UX при списании

**Файл:** `supabase/functions/admin-manual-charge/index.ts`

Перед списанием проверять флаг `supports_recurring`:

```typescript
// После получения payment method (строка ~217)
if (!paymentMethod.supports_recurring) {
  return new Response(JSON.stringify({ 
    success: false, 
    error: 'Карта не поддерживает автоматические списания. Клиенту нужно перепривязать карту.',
    requires_rebind: true,
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `supabase/functions/payment-methods-tokenize/index.ts` | Добавить `additional_data.contract: ["recurring"]` |
| `supabase/functions/admin-manual-charge/index.ts` | Добавить `card_on_file: {initiator: "merchant"}` + проверка `supports_recurring` |
| `supabase/functions/payment-methods-webhook/index.ts` | Сохранять `supports_recurring: true` |
| SQL миграция | Добавить колонку `supports_recurring` |

---

## Ожидаемый результат

1. **Новые привязки карт:**
   - Клиент проходит 3DS один раз при привязке
   - Карта сохраняется с `supports_recurring = true`
   - Все последующие списания проходят БЕЗ 3DS

2. **Старые карты:**
   - Система определяет что карта не поддерживает recurring
   - Админ видит понятное сообщение с предложением перепривязать карту
   - Нет попыток списания которые гарантированно провалятся

3. **Автосписания по рассрочке:**
   - Edge Function для автоматических списаний использует тот же подход
   - Списания проходят автоматически без участия клиента

---

## Тестирование

1. Привязать новую карту через личный кабинет
2. Убедиться что карта сохранена с `supports_recurring = true`
3. Сделать ручное списание через админку
4. Убедиться что списание прошло без ошибки P.4011
