
# Кнопка "Ссылка на оплату" вместо сырой ссылки в Telegram

## Проблема

Сейчас при отправке ссылки на оплату в Telegram клиент видит длинный URL прямо в тексте сообщения. Выглядит некрасиво.

## Решение

Убрать URL из текста сообщения и добавить inline-кнопку Telegram "Ссылка на оплату" под сообщением.

---

## Технические детали

### Файл 1: `src/components/admin/AdminPaymentLinkDialog.tsx`

Строки 148-163 -- изменить формат сообщения и передать дополнительный параметр `reply_markup`:

- Убрать из `telegramMessage` строку "Для оплаты перейдите по ссылке: ..."
- Передать в body вызова `telegram-send-notification` новый параметр `reply_markup` с inline-кнопкой:

```typescript
const telegramMessage = `💳 *Оплата подписки*

📦 Продукт: ${selectedProduct.name}
📋 Тариф: ${selectedTariff.name}
💰 Стоимость: ${amount} BYN
📅 Тип: ${typeLabel}`;

// body:
{
  user_id: userId,
  message_type: "custom",
  custom_message: telegramMessage,
  reply_markup: {
    inline_keyboard: [[{ text: "💳 Ссылка на оплату", url: generatedUrl }]]
  }
}
```

### Файл 2: `supabase/functions/telegram-send-notification/index.ts`

Строки 539-548 -- изменить логику формирования `keyboard`:

- Если из body пришёл `reply_markup`, использовать его вместо дефолтного keyboard
- Для остальных типов сообщений поведение не меняется

```typescript
const keyboard = reply_markup
  ? reply_markup
  : (message_type === 'access_revoked' || ...)
    ? { inline_keyboard: [[...]] }
    : undefined;
```

### Изменяемые файлы
1. `src/components/admin/AdminPaymentLinkDialog.tsx` -- убрать URL из текста, передать reply_markup
2. `supabase/functions/telegram-send-notification/index.ts` -- принять и использовать reply_markup из body
