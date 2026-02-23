
# Исправление проблем здоровья системы (INV-19B + INV-20)

## Диагноз

### INV-19B: "Token recurring без provider_subscriptions" — 125 найдено

**Из 125 записей:**
- **123** — подписки с `billing_type = mit`. Они управляются платформой (token-based charging), а НЕ BePaid. У них по определению нет записи в `provider_subscriptions`, и это **нормально**. Инвариант INV-19B считает их ошибкой, но это **ложноположительное срабатывание**.
- **3** — подписки с `billing_type = provider_managed`. Эти действительно должны иметь запись в `provider_subscriptions`, но её нет. Это реальная проблема.

**Причина**: запрос в `nightly-payments-invariants` (строки 143-174) фильтрует по `auto_renew = true` и наличию `payment_methods`, но **не исключает** подписки с `billing_type = mit`. MIT-подписки не нуждаются в `provider_subscriptions` — они списывают по токену напрямую.

**Исправление**: добавить фильтр в INV-19B, чтобы проверять только `billing_type IN ('provider_managed')` или хотя бы исключить `mit`.

### INV-20: "Оплаченные заказы без платежей" — 4 найдено

Проверены все 4 заказа:

| Заказ | Причина | Решение |
|---|---|---|
| `b8d7b867` (ORD-26-MLUXHRPN) | Legacy-дубликат: bepaid_uid `9cc19de5` привязан к платежу другого заказа `fa019f5a` | Пометить `superseded_by_repair` |
| `c0af8ad4` (ORD-26-MKDNM34Z) | Legacy-дубликат: bepaid_uid `6303b5a2` привязан к платежу другого заказа `1ea274b1` | Пометить `superseded_by_repair` |
| `cb92d748` (REN-26-40888f51) | Backfill-артефакт: `meta.payment_id = caf2d8ed` не существует в `payments_v2` | Пометить `no_real_payment` |
| `02302928` (ORD-ADM-1769114549787) | 3DS redirect с `reconciled_by`, но платёж не найден нигде | Пометить `superseded_by_repair` (reconciled) |

Все 4 можно исправить запуском `admin-repair-missing-payments` в режиме **execute** — функция уже содержит логику для каждого из этих случаев.

---

## План исправления

### P1 — Исправить INV-19B: убрать ложные срабатывания для MIT-подписок

**Файл:** `supabase/functions/nightly-payments-invariants/index.ts`

**Строки 143-148:** Добавить фильтр `billing_type`:

Было:
```text
.in("status", ["active", "trial", "past_due"])
.eq("auto_renew", true)
```

Станет:
```text
.in("status", ["active", "trial", "past_due"])
.eq("auto_renew", true)
.in("billing_type", ["provider_managed"])
```

Это уберет 123 ложных срабатывания. Останутся только 3 реальные проблемы (provider_managed без записи в provider_subscriptions).

### P2 — Исправить INV-20: запустить repair для 4 заказов

**Действие:** вызвать edge function `admin-repair-missing-payments` с `dry_run: false`.

Функция уже обрабатывает все 4 случая:
- UID collision (2 заказа с bepaid_uid, привязанным к другому заказу) -- пометит `superseded_by_repair`
- Backfill artifact (1 заказ с `source: subscription-renewal` + `backfill: true`) -- пометит `no_real_payment`
- Reconciled order (1 заказ с `reconciled_by`) -- пометит `superseded_by_repair`

### P3 — Для 3 реальных INV-19B (provider_managed): запустить backfill

**Действие:** вызвать edge function `admin-bepaid-backfill-subscriptions` для синхронизации 3 provider_managed подписок с BePaid API.

---

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `supabase/functions/nightly-payments-invariants/index.ts` | Добавить `.in("billing_type", ["provider_managed"])` в запрос INV-19B (строка 147) |

## Операционные действия (после деплоя)

1. Вызвать `admin-repair-missing-payments` с `{ dry_run: false, since_days: 90 }` -- исправит INV-20
2. Вызвать `admin-bepaid-backfill-subscriptions` с `{ dry_run: false }` -- исправит 3 реальных INV-19B
3. Запустить проверку здоровья повторно -- ожидаем 0 проблем

## DoD

1. INV-19B показывает 3 или 0 (не 125) после деплоя
2. INV-20 показывает 0 после запуска repair
3. SQL-пруф: все 4 заказа имеют флаги `superseded_by_repair` или `no_real_payment`
4. Нет ошибок сборки Edge Function

---

# PATCH: Удаление урока не блокируется shared assets

## Баг

При удалении урока-копии (shared assets):
- dry_run Edge Function: `allowed_count` может быть 0 (все пути shared → `finalDeletePaths=0`)
- `uploadToTrainingAssets.ts` строки 280-287: если `allowed_count <= 0` → ставит `result.error`, возвращает `ok=false`
- `useTrainingLessons.tsx` строка 235: `if (!result.ok)` → toast.error "Не удалось очистить файлы урока ... удаление отменено" → `return false`

Это НЕВЕРНО. Shared assets не должны блокировать удаление урока.

## Корневая причина

Edge function правильно определяет shared пути и возвращает `allowed_count=0` когда ВСЕ пути shared. Но фронтенд (`uploadToTrainingAssets.ts`) трактует `allowed_count=0` как ошибку, хотя при `skipped_shared_count > 0` это нормальная ситуация.

## Правила STOP (новые)

**STOP (ошибка, отмена удаления урока) ТОЛЬКО если:**
- `blocked_count > 0` (ownership/safety guards)
- `errors.length > 0` (Storage API вернул ошибку)

**НЕ STOP (info/warning, урок удаляется):**
- `allowed_count === 0` при `skipped_shared_count > 0` → toast.info
- `deleted_count < allowed_count` при `errors.length === 0` → toast.warning (файлы уже отсутствовали)
- `deleted_count === 0` при `allowed_count > 0` и `errors.length === 0` → toast.warning

## Изменения

### P1 — FRONTEND: uploadToTrainingAssets.ts (строки 280-287)

**Файл:** `src/components/admin/lesson-editor/blocks/uploadToTrainingAssets.ts`

**Было (строки 280-287):**
```typescript
// STOP: если нечего удалять
if (result.allowed_count <= 0) {
  result.error = "dry_run: allowed_count=0";
  if (result.blocked_count > 0) {
    console.warn("[deleteTrainingAssets] All paths blocked:", result.blocked_paths);
  }
  return result;
}
```

**Станет:**
```typescript
// Если нечего удалять — проверяем почему
if (result.allowed_count <= 0) {
  // STOP только если есть blocked (ownership guard)
  if (result.blocked_count > 0) {
    result.error = `Blocked paths: ${(result.blocked_paths ?? []).join(", ")}`;
    console.warn("[deleteTrainingAssets] All paths blocked:", result.blocked_paths);
    return result;
  }
  // Если всё shared — это нормально, не ошибка
  if ((dryData.skipped_shared_count ?? 0) > 0) {
    console.info("[deleteTrainingAssets] All paths shared — nothing to delete, ok");
    result.ok = true;
    result.skipped_shared_count = dryData.skipped_shared_count;
    return result;
  }
  // Если вообще ничего не прошло и не shared — тоже не блокируем (файлы могли быть уже удалены)
  console.warn("[deleteTrainingAssets] allowed_count=0, no shared, no blocked — files may not exist");
  result.ok = true;
  return result;
}
```

**Также:** добавить поле `skipped_shared_count` в интерфейс `DeleteTrainingAssetsResult`.

### P2 — EDGE: добавить attempted_delete_count

**Файл:** `supabase/functions/training-assets-delete/index.ts`

**Строка ~370 (execute early return при finalDeletePaths === 0):** добавить:
```text
attempted_delete_count: 0,
```

**Строка ~415 (execute response):** добавить:
```text
attempted_delete_count: finalDeletePaths.length,
```

### P3 — FRONTEND: информативные toast при shared/partial в deleteLesson

**Файл:** `src/hooks/useTrainingLessons.tsx` (строки 232-240)

**Было:**
```typescript
if (uniquePaths.length > 0) {
  const result = await deleteTrainingAssets(uniquePaths, { type: "lesson", id }, "lesson_deleted");
  if (!result.ok) {
    console.error("[deleteLesson] Storage cleanup failed, STOP:", result.error, "blocked_paths:", result.blocked_paths);
    toast.error(`Не удалось очистить файлы урока (${result.error}), удаление отменено`);
    return false;
  }
}
```

**Станет:**
```typescript
if (uniquePaths.length > 0) {
  const result = await deleteTrainingAssets(uniquePaths, { type: "lesson", id }, "lesson_deleted");
  if (!result.ok) {
    console.error("[deleteLesson] Storage cleanup failed, STOP:", result.error, "blocked_paths:", result.blocked_paths);
    toast.error(`Не удалось очистить файлы урока (${result.error}), удаление отменено`);
    return false;
  }
  // Информация о shared/пропущенных файлах (не блокирует удаление)
  if ((result.skipped_shared_count ?? 0) > 0) {
    toast.info(`Файлы используются в других уроках — пропущено: ${result.skipped_shared_count}`);
  } else if (result.deleted_count < uniquePaths.length) {
    toast.info("Некоторые файлы уже отсутствуют. Урок удалён.");
  }
}
```

### P4 — (ОПЦИОНАЛЬНО) Edge: улучшить message при all-shared

**Файл:** `supabase/functions/training-assets-delete/index.ts`

В early return при `finalDeletePaths.length === 0` и `sharedPaths.length > 0` — уже есть message: "All paths shared with other lessons — nothing deleted". ✅ Не требует изменений.

---

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/components/admin/lesson-editor/blocks/uploadToTrainingAssets.ts` | P1: не блокировать при `allowed_count=0` + shared; добавить `skipped_shared_count` в результат |
| `supabase/functions/training-assets-delete/index.ts` | P2: добавить `attempted_delete_count` в execute response (2 места) |
| `src/hooks/useTrainingLessons.tsx` | P3: toast.info при shared/partial вместо молчаливого прохода |

## НЕ трогаем

- Edge function shared guard — уже работает корректно
- `useUserProgress.tsx` — опционально, не влияет на удаление урока
- `FileBlock.tsx`, `AudioBlock.tsx` — уже исправлены в предыдущем патче
- `index.css`, `tailwind.config` — не трогаем

## DoD (пруфы обязательны)

### Тест-кейс 1 (главный): удаление урока-копии (shared assets)
- Урок удалён ✅
- Копия остаётся, файлы в копии работают ✅
- UI НЕ показывает ошибку "удаление отменено" ✅
- UI показывает toast.info: "пропущено: N" ✅

### Тест-кейс 2: удаление урока без копий
- `attempted_delete_count > 0`, `deleted_count == attempted_delete_count` ✅
- Без info toast ✅

### Тест-кейс 3: удаление урока с "мёртвой" ссылкой (404)
- Урок удалён ✅
- warning/info, но не error ✅

### Пруфы
- Скрин UI удаления при наличии копии (без ошибки) ✅
- Ответ training-assets-delete execute (Network) с `skipped_shared_count`, `attempted_delete_count` ✅
- Запись в `audit_logs` ✅
- Нет ошибок сборки/TS ✅
