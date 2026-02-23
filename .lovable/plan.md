

# PATCH P3.0.1d — FIX queue write: убрать 42P10

## Проблема

Таблица `payment_reconcile_queue` имеет **3 partial unique index** на `bepaid_uid` (все с `WHERE bepaid_uid IS NOT NULL`):

- `idx_queue_bepaid_uid_unique` -- `(bepaid_uid) WHERE NOT NULL`
- `idx_payment_queue_bepaid_uid_unique` -- `(bepaid_uid) WHERE NOT NULL`
- `idx_payment_queue_provider_uid_unique` -- `(provider, bepaid_uid) WHERE NOT NULL`

Postgres не принимает `ON CONFLICT (bepaid_uid)` с partial index -- ошибка `42P10`. Текущий `.upsert(..., { onConflict: 'bepaid_uid' })` на строках 933-967 файла `bepaid-webhook/index.ts` всегда падает.

При этом в таблице 973 записи (все с `bepaid_uid`) -- значит реальные вебхуки как-то пишут (возможно через другой путь или старую версию кода).

## Решение (Вариант A -- без миграций БД)

Заменить `.upsert(... onConflict: 'bepaid_uid')` на ручную идемпотентность: `SELECT` -> `INSERT`.

### Изменение в файле

**Файл:** `supabase/functions/bepaid-webhook/index.ts`
**Строки:** 928-996 (блок queue write)

Текущий код (строки 933-967):
```
const { data: queueRow, error: queueError } = await supabase
  .from('payment_reconcile_queue')
  .upsert({...}, { onConflict: 'bepaid_uid', ignoreDuplicates: false })
  .select(...)
  .maybeSingle();
```

Заменить на:
```
// Step 1: Check if already exists by bepaid_uid
const { data: existingRow } = await supabase
  .from('payment_reconcile_queue')
  .select('id, source, bepaid_uid')
  .eq('bepaid_uid', webhookTransaction.uid)
  .maybeSingle();

let queueRow = null;
let queueError = null;

if (existingRow) {
  // Duplicate -- reuse existing row
  queueRow = existingRow;
  console.log(`[WEBHOOK-QUEUE] DUPLICATE existing id=${existingRow.id} uid=${existingRow.bepaid_uid}`);
} else {
  // Insert new row (NOT upsert)
  const { data, error } = await supabase
    .from('payment_reconcile_queue')
    .insert({ /* same fields as current upsert */ })
    .select('id, source, bepaid_uid, created_at')
    .maybeSingle();
  queueRow = data;
  queueError = error;
}
```

Остальной код (строки 969-996: error logging, trace assignment) остается без изменений.

### Что НЕ трогаем

- `admin-bepaid-webhook-replay/index.ts` -- без изменений
- Индексы/миграции БД -- без изменений
- Любые другие файлы проекта

## Проверка DoD

1. Пересоздать временный `admin-replay-self-test` (тот же код, что уже утвержден)
2. Вызвать -- ожидать `queue_write_ok: true`, `queue_row_id != null`
3. Вызвать повторно с тем же uid -- ожидать `queue_write_ok: true` (duplicate reuse)
4. SQL-пруф: `SELECT count(*) FROM payment_reconcile_queue WHERE source IN ('webhook_replay') AND created_at > now() - interval '10 min'` > 0
5. В логах `bepaid-webhook` нет `42P10`
6. Удалить `admin-replay-self-test` после подтверждения

## Затронутые файлы

| Файл | Действие |
|---|---|
| `supabase/functions/bepaid-webhook/index.ts` | Правка строк 928-996: upsert -> select+insert |
| `supabase/functions/admin-replay-self-test/index.ts` | Создать (временно, для DoD) |
| `supabase/config.toml` | Добавить секцию self-test (временно) |

