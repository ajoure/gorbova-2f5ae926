
# План исправлений: bePaid Subscriptions UI

## Выявленные проблемы

| # | Проблема | Причина |
|---|----------|---------|
| 1 | Данные обнуляются и загружается только 20 записей | Edge function имеет `maxProcess = 20` (STOP-guard) |
| 2 | Показывает 7 активных вместо 16 | 3 ID отсутствуют в БД + лимит 20 не даёт загрузить все 61 запись |
| 3 | Статусы "redirecting", "failed" на английском | Не добавлены в `STATUS_LABELS` |
| 4 | Плашки статистики занимают 50% экрана | Сетка 8 колонок слишком крупная |
| 5 | ФИО клиентов не кликабельны | Нет использования `ClickableContactName` |
| 6 | После синхронизации "50 загружено" но показывает 20 | Лимит `maxProcess = 20` в Edge |

---

## Решение

### PATCH-N: Увеличить лимит загрузки и сохранять данные

**Файл:** `supabase/functions/bepaid-list-subscriptions/index.ts`

```text
Изменения:
1. Увеличить maxProcess с 20 до 100 (с сохранением STOP-guard)
2. Не пропускать записи, если details уже fetched ранее
3. Добавить параметр ?limit=N для гибкости
```

Было:
```typescript
const maxProcess = 20; // STOP-guard for batch limit
```

Станет:
```typescript
const maxProcess = Math.min(parseInt(url.searchParams.get('limit') || '100'), 100);
```

---

### PATCH-O: Добавить недостающие статусы в словарь

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

Было (строка 124-134):
```typescript
const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  trial: 'Пробный период',
  pending: 'Ожидает подтверждения',
  past_due: 'Просрочена',
  canceled: 'Отменена',
  terminated: 'Завершена',
  paused: 'Приостановлена',
  unknown: 'Неизвестно',
  legacy: 'Устаревшая',
};
```

Станет:
```typescript
const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  trial: 'Пробный период',
  pending: 'Ожидает подтверждения',
  past_due: 'Просрочена',
  canceled: 'Отменена',
  terminated: 'Завершена',
  paused: 'Приостановлена',
  unknown: 'Неизвестно',
  legacy: 'Устаревшая',
  // PATCH-O: Additional statuses from bePaid
  redirecting: 'Перенаправление',
  failed: 'Ошибка',
  expired: 'Истекла',
  suspended: 'Заблокирована',
};
```

---

### PATCH-P: Компактные плашки статистики

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

Текущий layout (строки 464-505): сетка `grid-cols-2 md:grid-cols-8` с большими карточками.

Новый layout: горизонтальная строка с мини-бейджами:

```typescript
{/* Compact stats row */}
<div className="flex flex-wrap items-center gap-2">
  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-full text-sm">
    <span className="font-semibold">{rawStats.total}</span>
    <span className="text-muted-foreground text-xs">всего</span>
  </div>
  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-full text-sm">
    <span className="font-semibold">{rawStats.active}</span>
    <span className="text-xs">активных</span>
  </div>
  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-600 rounded-full text-sm">
    <span className="font-semibold">{rawStats.trial}</span>
    <span className="text-xs">пробных</span>
  </div>
  {canceledCount > 0 && (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 rounded-full text-sm text-muted-foreground">
      <span className="font-semibold">{canceledCount}</span>
      <span className="text-xs">отменённых</span>
    </div>
  )}
  {rawStats.orphans > 0 && (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-600 rounded-full text-sm">
      <span className="font-semibold">{rawStats.orphans}</span>
      <span className="text-xs">сирот</span>
    </div>
  )}
</div>
```

Это уменьшит высоту с ~150px до ~40px.

---

### PATCH-Q: Кликабельные ФИО с открытием карточки контакта

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

Добавить импорт:
```typescript
import { ClickableContactName } from "@/components/admin/ClickableContactName";
```

Заменить в колонке "Связь" (строки 828-839):

Было:
```typescript
<Badge variant="outline" className="flex items-center gap-1 w-fit bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
  <Link2 className="h-3 w-3" />
  {sub.linked_profile_name || "Связана"}
</Badge>
```

Станет:
```typescript
{sub.linked_user_id ? (
  <ClickableContactName
    userId={sub.linked_user_id}
    name={sub.linked_profile_name}
    email={sub.customer_email}
    fromPage="bepaid-subscriptions"
    className="text-sm"
  />
) : (
  <Badge variant="outline" className="flex items-center gap-1 w-fit bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
    <Link2 className="h-3 w-3" />
    Связана
  </Badge>
)}
```

При клике на имя пользователь перейдёт к `/admin/contacts?contact={userId}&from=bepaid-subscriptions`.

---

### PATCH-R: Добавить недостающие ID в БД

**Действие:** Вставить 3 недостающих активных подписки в `provider_subscriptions`:

```sql
INSERT INTO provider_subscriptions (provider, provider_subscription_id, state, created_at)
VALUES 
  ('bepaid', 'sbs_01dec0ed1f7cc55f', 'active', now()),
  ('bepaid', 'sbs_4f94d889190cd704', 'active', now()),
  ('bepaid', 'sbs_9482dac56fc8e66c', 'active', now())
ON CONFLICT (provider, provider_subscription_id) DO NOTHING;
```

---

## Файлы к изменению

| Файл | Патчи |
|------|-------|
| `supabase/functions/bepaid-list-subscriptions/index.ts` | PATCH-N (увеличить лимит до 100) |
| `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx` | PATCH-O (статусы), PATCH-P (компактные плашки), PATCH-Q (кликабельные ФИО) |
| SQL миграция | PATCH-R (добавить 3 ID) |

---

## DoD (Definition of Done)

| # | Проверка | Ожидание |
|---|----------|----------|
| 1 | UI показывает всего подписок | ≥50 (вместо 20) |
| 2 | UI показывает активных | 16 (как в bePaid) |
| 3 | Статусы "redirecting", "failed" | На русском ("Перенаправление", "Ошибка") |
| 4 | Плашки статистики | Одна компактная строка |
| 5 | Клик на имя клиента | Открывает карточку контакта |
| 6 | SQL пруф недостающих ID | 0 (все добавлены) |

---

## Приоритет

1. **CRITICAL**: PATCH-N (лимит 100) — без этого UI показывает только 20
2. **CRITICAL**: PATCH-R (добавить 3 ID) — иначе активные подписки не видны
3. **HIGH**: PATCH-O (статусы RU) — UX
4. **HIGH**: PATCH-P (компактные плашки) — UX
5. **MEDIUM**: PATCH-Q (кликабельные ФИО) — UX
