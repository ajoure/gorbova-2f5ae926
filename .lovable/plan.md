
# Корневая причина: `active_until = NULL` в `telegram_access` = "вечный доступ"

## Точный баг (доказан SQL + API)

Предыдущий патч обнулил `telegram_access.active_until = NULL` при revoke, думая это уберёт доступ. Но в `accessValidation.ts` строка 113 и строка 256:

```typescript
.or(`active_until.is.null,active_until.gt.${nowStr}`)
```

Семантика `active_until IS NULL` в этой системе = **"доступ постоянный, без срока истечения"** (как у подписок без end date). Это стандартный паттерн "NULL = нет ограничения по времени".

**Результат:** после ручного обнуления `active_until`:
- `telegram_access` для walia_777: `active_until=NULL, state_chat='revoked', state_channel='revoked'`
- `hasValidAccessBatch` → шаг 4 → `active_until.is.null` → запись найдена → `valid=true`, `source='telegram_access'`
- `kick_present` → user в `skippedHasAccess` → **"Удалено: 0 участников"**

Доказательство из API dry_run:
```json
"skipped_has_access": [{"access_source": "telegram_access", "telegram_user_id": 602210376, "telegram_username": "walia_777"}]
```

## Две проблемы, одно решение

### Проблема 1: `accessValidation.ts` — `telegram_access` не проверяет `state_*`

Текущий запрос (строки 108–120 для single, строки 249–273 для batch):
```typescript
// НЕ проверяет state_chat/state_channel — только active_until!
.from('telegram_access')
.select('id, active_until')
.or(`active_until.is.null,active_until.gt.${nowStr}`)
```

Записи с `state='revoked'` и `active_until=NULL` проходят как "активный доступ".

**Fix:** Добавить фильтр `NOT IN ('revoked')` для state полей. Запись в `telegram_access` считается активной ТОЛЬКО если:
- `active_until IS NULL OR active_until > now` **И**
- `state_chat != 'revoked' AND state_channel != 'revoked'`

### Проблема 2: Для ревокнутых записей нужна другая семантика `active_until`

`active_until = NULL` у ревокнутой записи сейчас = "вечный доступ". Это неверно. При revoke нужно ставить `active_until = now()` (прошедшее время) — тогда запрос `.gt.now` не найдёт запись.

НО: менять `telegram-revoke-access` обратно (с NULL на now) — это регрессия предыдущего патча (мы специально ставили NULL). Более правильный fix — в `accessValidation.ts` добавить фильтр по `state`.

## План правок (минимальный diff, 2 файла)

### ПРАВКА 1: `supabase/functions/_shared/accessValidation.ts`

**Функция `hasValidAccess` (строки 108–129) — одиночная проверка:**

Добавить фильтр по state в запрос `telegram_access`:
```typescript
// БЫЛО:
const telegramAccessQuery = supabase
  .from('telegram_access')
  .select('id, active_until')
  .eq('user_id', userId)
  .or(`active_until.is.null,active_until.gt.${nowStr}`)
  .limit(1);

// СТАНЕТ:
const telegramAccessQuery = supabase
  .from('telegram_access')
  .select('id, active_until, state_chat, state_channel')
  .eq('user_id', userId)
  .or(`active_until.is.null,active_until.gt.${nowStr}`)
  .neq('state_chat', 'revoked')   // ← добавить
  .neq('state_channel', 'revoked') // ← добавить
  .limit(1);
```

**Функция `hasValidAccessBatch` (строки 249–273) — батч-проверка:**

Аналогично:
```typescript
// БЫЛО:
const telegramQuery = supabase
  .from('telegram_access')
  .select('id, user_id, active_until')
  .in('user_id', stillWithoutAccess2)
  .or(`active_until.is.null,active_until.gt.${nowStr}`);

// СТАНЕТ:
const telegramQuery = supabase
  .from('telegram_access')
  .select('id, user_id, active_until, state_chat, state_channel')
  .in('user_id', stillWithoutAccess2)
  .or(`active_until.is.null,active_until.gt.${nowStr}`)
  .neq('state_chat', 'revoked')   // ← добавить
  .neq('state_channel', 'revoked') // ← добавить
```

После этой правки:
- walia_777: `state_chat='revoked'` → запись НЕ пройдёт фильтр → `valid=false` → кик выполнится

### ПРАВКА 2: `supabase/functions/telegram-revoke-access/index.ts`

Убедиться что при revoke `active_until` ставится в **будущее прошедшее** время, а НЕ NULL (двойная защита):

```typescript
// При revoke telegram_access:
await supabase.from('telegram_access').update({
  state_chat: 'revoked',
  state_channel: 'revoked',
  active_until: new Date(Date.now() - 1000).toISOString(), // 1 секунда назад — доступ истёк
  last_sync_at: new Date().toISOString(),
}).eq('user_id', profileUserId).eq('club_id', club_id);
```

Это даёт двойную защиту: и `state='revoked'` фильтр, и `active_until < now` фильтр.

## Ручной фикс текущей ситуации walia_777

Сразу после деплоя нужно обновить `telegram_access` для walia_777 — поставить `active_until` в прошлое:

```sql
UPDATE telegram_access
SET active_until = '2026-02-18 00:00:00+00'  -- прошедшее время
WHERE user_id = '7764bce4-627f-4846-b366-0066ef8c4d6f'
  AND club_id = 'fa547c41-3a84-4c4f-904a-427332a0506e';
```

После этого `hasValidAccessBatch` вернёт `valid=false` для walia_777, и нажатие "Удалить нарушителей" реально выполнит бан.

## Таблица правок

| # | Файл | Строки | Изменение |
|---|------|--------|-----------|
| 1 | `_shared/accessValidation.ts` | 108–120 | Добавить `.neq('state_chat','revoked').neq('state_channel','revoked')` в hasValidAccess |
| 2 | `_shared/accessValidation.ts` | 249–260 | Добавить `.neq('state_chat','revoked').neq('state_channel','revoked')` в hasValidAccessBatch |
| 3 | `telegram-revoke-access/index.ts` | ~502 | При revoke ставить `active_until = now() - 1s` вместо `NULL` |
| 4 | SQL (разово) | — | UPDATE telegram_access SET active_until = прошлое WHERE user_id=walia_777 |

## Что НЕ меняем

- Логику kick самих по себе — она правильная
- `calculateAccessStatus` — он правильный
- Фильтры по subscriptions, entitlements, manual_access, grants — они правильные
- UI компоненты

## DoD

- **A)** `dry_run` для walia_777 → `candidates_count: 1`, НЕ в `skipped_has_access`
- **B)** Нажать "Удалить нарушителей" → toast "Удалено: 1 участников"
- **C)** SQL: `SELECT in_chat, in_channel FROM telegram_club_members WHERE id='974e1b66...'` → обе `false`
- **D)** SQL: `SELECT active_until FROM telegram_access WHERE user_id='7764bce4...'` → прошедшая дата (не NULL)
- **E)** Регрессия: пользователь с `telegram_access` без `state_revoked` и без подписки — всё ещё виден как `valid=true` (если `active_until IS NULL` или будущая дата) — не ломаем логику для нормальных пользователей
