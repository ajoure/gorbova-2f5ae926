

# Диагностика: Telegram реакции в контакт-центре — корневая причина

## Уточнение проблемы

Вы сообщили: баг в **Telegram-чате контакт-центра** (`/admin/communication` → Telegram), а не в тикетах поддержки. Конкретно:
- Админ ставит реакцию в веб-UI → клиент в Telegram её **не видит**
- Клиент ставит реакцию в Telegram → админ в веб-UI её **не видит**

## Результат аудита кода

### Что есть сейчас

Таблица `telegram_message_reactions` и хук `useTelegramReactions` — это **локальная фича для админов**. Она работает только внутри веб-интерфейса:

```text
Админ кликает emoji → INSERT в telegram_message_reactions → realtime → другой админ видит
```

### Чего НЕТ (корневая причина)

**1. Исходящее направление (Admin → Telegram)**:
В `telegram-admin-chat/index.ts` есть action `sync_reaction`, но он предназначен **только для тикетов** (ищет `ticket_telegram_sync`, `ticket_message_id`). Для обычных Telegram-сообщений из контакт-центра **нет кода**, который вызывает Telegram API `setMessageReaction`.

В хуке `useToggleTelegramReaction` (строка 117) при `onSuccess` делается только `invalidateQueries` — **нет вызова edge function** для синхронизации с Telegram.

**2. Входящее направление (Telegram → Admin)**:
В `telegram-webhook/index.ts` интерфейс `TelegramUpdate` (строки 9-43) **не содержит** поле `message_reaction`. Webhook **не обрабатывает** события реакций от Telegram. Даже если клиент ставит реакцию в Telegram, webhook это игнорирует.

### Вывод

Это **не баг кэша/invalidation/refetch**. Это **отсутствующая функциональность** — двусторонняя синхронизация реакций между веб-UI и Telegram API.

## План реализации (PATCH)

### 1. Исходящее: Admin → Telegram

**Файл:** `supabase/functions/telegram-admin-chat/index.ts`

Добавить новый action `sync_telegram_reaction`:
- Принимает `telegram_message_db_id` (UUID из `telegram_messages`), `emoji`, `remove`
- По `telegram_message_db_id` находит `message_id` (Telegram int) и `user_id` (чтобы определить `chat_id`)
- Определяет бота через профиль пользователя
- Вызывает `setMessageReaction` с нужным `chat_id`, `message_id`, `emoji`

**Файл:** `src/hooks/useTelegramReactions.ts`

В `useToggleTelegramReaction.onSuccess` добавить fire-and-forget вызов edge function:
```typescript
onSuccess: (_, variables) => {
  queryClient.invalidateQueries({ queryKey: ["telegram-reactions"] });
  // Sync to Telegram
  supabase.functions.invoke("telegram-admin-chat", {
    body: {
      action: "sync_telegram_reaction",
      telegram_message_db_id: variables.messageId,
      emoji: variables.emoji,
      remove: /* was removed */,
    },
  }).catch(() => {});
},
```

### 2. Входящее: Telegram → Admin

**Файл:** `supabase/functions/telegram-webhook/index.ts`

- Расширить интерфейс `TelegramUpdate` полем `message_reaction`
- Добавить обработчик для `message_reaction` событий:
  - По `message_reaction.chat.id` + `message_reaction.message_id` найти запись в `telegram_messages`
  - Записать/удалить строку в `telegram_message_reactions` (через service_role, т.к. клиент не admin)
  - Определить `user_id` клиента по `telegram_user_id` в profiles

**Файл:** `supabase/migrations/...`

- Добавить RLS-политику для INSERT/DELETE через service_role (webhook работает с service_role, текущие политики требуют admin-роли)

**Файл:** Telegram Bot Settings

- Убедиться, что webhook бота получает `message_reaction` updates (нужно вызвать `setWebhook` с `allowed_updates` включающим `message_reaction`)

### 3. Стабилизация хука `useTelegramReactions`

**Файл:** `src/hooks/useTelegramReactions.ts`

По аналогии с уже исправленным `useTicketReactions`:
- `queryKey` сделать стабильным через CSV: `["telegram-reactions", stableIdsCsv, viewerId]`
- `useEffect` deps: убрать `stableIds.length`, добавить `stableIdsCsv`, `viewerId`
- В realtime handler: `invalidateQueries` + `refetchQueries` с `type: "active"` по exact key
- `mutationFn` возвращать `{ wasRemoved }` для передачи в edge function

## Затронутые файлы

| Файл | Действие |
|---|---|
| `supabase/functions/telegram-admin-chat/index.ts` | Новый action `sync_telegram_reaction` |
| `supabase/functions/telegram-webhook/index.ts` | Обработка `message_reaction` events |
| `src/hooks/useTelegramReactions.ts` | Sync to Telegram в onSuccess + стабилизация queryKey |
| SQL миграция | Доп. RLS-политика для service_role INSERT/DELETE |

## Что НЕ трогаем

- `useTicketReactions.ts` — уже исправлен, не относится к данной проблеме
- `useTickets.ts` — уже исправлен
- `ContactTelegramChat.tsx` — UI рендер реакций корректен (строки 1141-1160)
- `TicketChat.tsx`, `TicketMessage.tsx` — не затрагиваются

## DoD

1. Видео: админ ставит реакцию в веб-UI → клиент видит её в Telegram
2. Видео: клиент ставит реакцию в Telegram → админ видит в контакт-центре без F5
3. SQL-пруф: строки в `telegram_message_reactions` после обоих действий
4. Скрин: логи edge function без ошибок

## Предупреждение

Telegram API `setMessageReaction` поддерживает ограниченный набор emoji (только стандартные Telegram-реакции, не произвольные Unicode emoji). Исходящая синхронизация может не поддерживать все 50 emoji из `EMOJI_LIST`. Нужно будет либо маппить emoji на поддерживаемые Telegram, либо ограничить набор для Telegram-чата.

