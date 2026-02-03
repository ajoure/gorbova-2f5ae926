
# План исправления: Telegram-уведомления и отображение платежей

## Выявленные проблемы

### Проблема 1: Кнопка "Тест себе" не работает

**Файл:** `supabase/functions/telegram-send-test/index.ts`

**Причина:** Функция ищет колонку `telegram_link` в профиле (строка 63), но такой колонки не существует.

**Актуальные колонки:**
- `telegram_username` — username пользователя
- `telegram_user_id` — числовой ID для отправки сообщений

**Исправление:**
```typescript
// Строка 61-65: Было:
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("telegram_link")
  .eq("id", userId)
  .single();

// Станет:
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("telegram_user_id, telegram_username")
  .eq("user_id", userId)  // Также исправить: id -> user_id
  .single();

// Строка 67: Было:
if (profileError || !profile?.telegram_link) {

// Станет:
if (profileError || !profile?.telegram_user_id) {
```

**Удалить ненужный поиск через `telegram_members` (строки 77-107)** — у нас уже есть `telegram_user_id` в профиле.

---

### Проблема 2: Платежи не отображаются в карточке контакта

**Файл:** `supabase/functions/bepaid-webhook/index.ts`

**Причина:** При создании/обновлении `payments_v2` не указывается `profile_id`, даже когда он есть в связанном заказе `orders_v2`.

**Места для исправления:**

1. **Строки 2073-2091** (legacy checkout flow — создание платежа):
   ```typescript
   // Было:
   await supabase.from('payments_v2').insert({
     order_id: orderV2.id,
     user_id: order.user_id,
     amount: actualAmount,
     ...
   });

   // Станет:
   await supabase.from('payments_v2').insert({
     order_id: orderV2.id,
     user_id: order.user_id,
     profile_id: orderV2.profile_id || order.profile_id,  // ДОБАВИТЬ
     amount: actualAmount,
     ...
   });
   ```

2. **Строки 895-907** (`basePaymentUpdate` для direct-charge flow):
   ```typescript
   // После получения orderV2 (строка 1048-1052) добавить profile_id в update:
   
   // Строка 1040: добавить в update:
   await supabase.from('payments_v2').update({
     ...basePaymentUpdate,
     status: 'succeeded',
     paid_at: now.toISOString(),
     profile_id: orderV2?.profile_id || null,  // ДОБАВИТЬ
   }).eq('id', paymentV2.id);
   ```

3. **Строки 3022-3033** (orphan order reconstruction):
   ```typescript
   // Получить profile_id перед insert
   const { data: profileForPayment } = await supabase
     .from('profiles')
     .select('id')
     .eq('user_id', userId)
     .maybeSingle();

   await supabase.from('payments_v2').insert({
     order_id: order.id,
     profile_id: profileForPayment?.id || null,  // ДОБАВИТЬ
     ...
   });
   ```

---

### Проблема 3: Уведомления в Telegram не приходят администраторам

**Файл:** `supabase/functions/bepaid-webhook/index.ts`

**Причина:** В legacy checkout flow (строки 2520-2585) уведомление отправляется только по **email через Resend**, но не через **Telegram**.

Блок уведомлений через Telegram (строки 1605-1680) находится только в direct-charge flow (`if (paymentV2)...`), а legacy flow обходит его.

**Исправление:** Добавить вызов `telegram-notify-admins` в legacy flow **после строки 2518** (после audit_log):

```typescript
// После строки 2518, ПЕРЕД email уведомлением:

// === TELEGRAM ADMIN NOTIFICATION (legacy flow) ===
try {
  const paymentType = meta.is_trial ? '🔔 Пробный период' : '💰 Оплата';
  const productName = product?.name || productV2?.name || 'Подписка';
  const tariffName = tariffData?.name || meta.tariff_code || '';
  const amountFormatted = Number(order.amount).toFixed(2);
  
  // Get customer profile for notification
  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('full_name, email, phone, telegram_username')
    .eq('user_id', order.user_id)
    .maybeSingle();

  const telegramNotifyMessage = `${paymentType}\n\n` +
    `👤 <b>Клиент:</b> ${customerProfile?.full_name || meta.customer_first_name || 'Не указано'}\n` +
    `📧 Email: ${customerProfile?.email || order.customer_email || 'Не указан'}\n` +
    `📱 Телефон: ${customerProfile?.phone || meta.customer_phone || 'Не указан'}\n` +
    (customerProfile?.telegram_username ? `💬 Telegram: @${customerProfile.telegram_username}\n` : '') +
    `\n📦 <b>Продукт:</b> ${productName}\n` +
    `📋 Тариф: ${tariffName}\n` +
    `💵 Сумма: ${amountFormatted} ${order.currency}\n` +
    `🆔 Заказ: ${orderV2?.order_number || internalOrderId}`;

  const notifyResponse = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-notify-admins`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ 
        message: telegramNotifyMessage,
        source: 'bepaid_webhook_legacy',
        order_id: orderV2?.id || internalOrderId,
        order_number: orderV2?.order_number,
      }),
    }
  );

  const notifyData = await notifyResponse.json().catch(() => ({}));
  if (!notifyResponse.ok) {
    console.error('Admin Telegram notification error (legacy):', notifyResponse.status, notifyData);
  } else {
    console.log('Admin Telegram notification sent (legacy):', notifyData);
  }
} catch (telegramNotifyError) {
  console.error('Error sending Telegram notification to admins (legacy):', telegramNotifyError);
  // Don't fail the webhook
}
```

---

## Сводка изменений по файлам

| Файл | Изменение |
|------|-----------|
| `supabase/functions/telegram-send-test/index.ts` | Исправить поле `telegram_link` → `telegram_user_id`, поле `id` → `user_id`, убрать лишний lookup |
| `supabase/functions/bepaid-webhook/index.ts` | 3 места: добавить `profile_id` при создании/обновлении `payments_v2`, добавить Telegram-уведомление в legacy flow |

---

## Дополнительно: Миграция для исправления существующих платежей

Нужна SQL-миграция для обновления `profile_id` в существующих `payments_v2` записях:

```sql
-- Восстановить profile_id из связанного order_v2
UPDATE payments_v2 p
SET profile_id = o.profile_id
FROM orders_v2 o
WHERE p.order_id = o.id
  AND p.profile_id IS NULL
  AND o.profile_id IS NOT NULL;

-- Для платежей без order_id — найти profile по user_id
UPDATE payments_v2 p
SET profile_id = pr.id
FROM profiles pr
WHERE p.user_id = pr.user_id
  AND p.profile_id IS NULL
  AND pr.id IS NOT NULL;
```

---

## Порядок исполнения

1. **Критично (немедленно):**
   - Исправить `telegram-send-test/index.ts`
   - Добавить `profile_id` в bepaid-webhook при создании/обновлении платежей
   - Добавить Telegram-уведомление в legacy flow

2. **Миграция:**
   - Выполнить SQL для восстановления `profile_id` в существующих платежах

3. **Тестирование:**
   - Проверить кнопку "Тест себе" в мастере KB
   - Сделать тестовую покупку и проверить:
     - Платёж отображается в карточке контакта
     - Telegram-уведомление приходит администраторам
