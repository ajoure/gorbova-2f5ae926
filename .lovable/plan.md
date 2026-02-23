
# Удаление тестовой записи и фильтрация webhook_replay из статистики

## Проблема

1. В `payment_reconcile_queue` есть тестовая запись от webhook replay (`source = 'webhook_replay'`, `bepaid_uid = 'test-replay-dod-1771853656930'`, amount=1 BYN, status=pending). Она создаёт "единичку" на бейдже платежей и попадает в выписку.
2. Хук `useUnmappedProductsCount` не фильтрует записи с `source = 'webhook_replay'`, поэтому тестовые replay-записи считаются как "немаппированные продукты".

## Решение

### 1. Удалить тестовую запись из БД

Удалить конкретную запись (UUID `98dfe8e8-df33-4cf2-93c3-80a145eff959`) из `payment_reconcile_queue`.

### 2. Исключить webhook_replay из счётчика немаппированных

**Файл: `src/hooks/useUnmappedProductsCount.tsx`**

Добавить фильтр `.not('source', 'eq', 'webhook_replay')` в запрос к `payment_reconcile_queue`, чтобы тестовые replay-записи не влияли на бейдж.

```
// Было:
.in("status", ["pending", "processing"]);

// Станет:
.in("status", ["pending", "processing"])
.not('source', 'eq', 'webhook_replay');
```

### 3. Исключить webhook_replay из выписки BePaid

**Файл: `src/hooks/useBepaidStatement.ts`** (или где формируется запрос для выписки)

Добавить аналогичный фильтр, чтобы replay-записи не попадали в таблицу выписки и статистику.

## Затронутые файлы

| Файл | Действие |
|---|---|
| БД (data delete) | Удалить 1 запись из `payment_reconcile_queue` |
| `src/hooks/useUnmappedProductsCount.tsx` | Добавить фильтр `.not('source', 'eq', 'webhook_replay')` |
| `src/hooks/useBepaidStatement.ts` | Добавить фильтр исключения webhook_replay (если данные оттуда) |

## Что НЕ трогаем

- Edge function `admin-bepaid-webhook-replay` -- без изменений
- Таблица `webhook_events` -- без изменений
- Остальные хуки и компоненты платежей -- без изменений
