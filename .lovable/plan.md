
# Исправление логики бизнес-метрик в ClubQuickStats

## Корень проблемы (доказано SQL)

Текущий хук `useClubBusinessStats` считает **строки**, а не **уникальных людей**:

| Метрика | Текущая (неверная) | Правильная |
|---------|-------------------|------------|
| Всего с доступом | 546 (все active, включая end_at < NOW()) | 162 (уникальные user_id с end_at > NOW()) |
| Новые | 531 (все active grant-записи за период) | ~5-10 (уникальные люди, чей ПЕРВЫЙ ever grant — за период) |
| Не продлили | 423 (все revoked/expired записи за период) | 33 (уникальные люди, чей ПОСЛЕДНИЙ grant истёк и нет активного) |

Три отдельных ошибки:

**Ошибка 1 — "Всего с доступом":** `WHERE status = 'active'` без фильтра `end_at > NOW()`. В БД 36 записей `active` с просроченным `end_at`. Плюс не считает уникальных — считает строки.

**Ошибка 2 — "Новые":** При продлении подписки создаётся **новый** grant — поэтому за 30 дней накопилось 531 записей. Настоящих новых членов (первое вступление) — 122 за 30 дней, за 7 дней — нужно проверить.

**Ошибка 3 — "Не продлили":** Считает ВСЕ revoked/expired строки за период, включая тех, кто потом вернулся (у них уже есть новый active grant). Правильно: только те, у кого ПОСЛЕДНИЙ grant — revoked/expired И нет действующего active.

## Правильные SQL-запросы

### Всего с доступом
```sql
SELECT COUNT(DISTINCT user_id)
FROM telegram_access_grants
WHERE club_id = :clubId
  AND status = 'active'
  AND (end_at IS NULL OR end_at > NOW())
```
Результат: **162** ✓

### Новые за период
```sql
-- Люди, у которых ПЕРВЫЙ grant в клубе создан за период
WITH first_grants AS (
  SELECT user_id, MIN(created_at) as first_ever
  FROM telegram_access_grants
  WHERE club_id = :clubId
  GROUP BY user_id
)
SELECT COUNT(*) FROM first_grants
WHERE first_ever >= NOW() - INTERVAL ':period days'
```
Семантика: "Впервые вступили в клуб за выбранный период".

### Не продлили за период
```sql
-- Последний grant пользователя — revoked/expired за период, И нет активного сейчас
WITH latest_grants AS (
  SELECT DISTINCT ON (user_id)
    user_id, status, updated_at
  FROM telegram_access_grants
  WHERE club_id = :clubId
  ORDER BY user_id, created_at DESC
)
SELECT COUNT(*) FROM latest_grants
WHERE status IN ('revoked', 'expired')
  AND updated_at >= NOW() - INTERVAL ':period days'
```
Семантика: "Последний раз имели доступ, но сейчас — нет, и отпали за выбранный период". Если вернулись — их последний grant active, они НЕ попадают сюда. ✓

### Субтитры карточек (обновить)
- **"Всего с доступом"**: подпись `"уникальных участников"` вместо `"активных grant-ов"`
- **"Новые"**: подпись `"впервые вступили"` чтобы отличать от "продлили"
- **"Не продлили"**: подпись `"ушли из клуба"` — более понятно

## Что меняем (точечные правки)

### Файл 1: `src/hooks/useTelegramIntegration.tsx` — хук useClubBusinessStats

Заменить три запроса (строки 818–839) на корректные:

**Запрос 3 (totalWithAccess):** добавить `COUNT(DISTINCT user_id)` через `.select('user_id')` + фильтр `end_at > now()`.

**Запрос 4 (newCount):** вместо `gte('created_at', since)` на всех active-записях — сначала получаем минимальный created_at по user_id через CTE. В JS: получаем все записи клуба с user_id и created_at, группируем по user_id, берём min(created_at), фильтруем >= since.

**Запрос 5 (revokedCount):** вместо простого фильтра — получаем последний grant каждого user_id, фильтруем revoked/expired за период, исключаем тех у кого есть active.

Поскольку Supabase не поддерживает CTE через JS-клиент напрямую, реализуем логику в JS:

```typescript
// Шаг 1: получить все grant-ы клуба (user_id + status + created_at + updated_at + end_at)
// Используем пагинацию чтобы обойти лимит 1000 строк
const allGrants = await fetchAllGrants(clubId);

// totalWithAccess: уникальные active с end_at > now
const now = new Date();
const activeSet = new Set(
  allGrants
    .filter(g => g.status === 'active' && (!g.end_at || new Date(g.end_at) > now))
    .map(g => g.user_id)
);
const totalWithAccess = activeSet.size;

// newCount: первый grant за period
const sinceDate = new Date(Date.now() - periodDays * 86400000);
const firstGrantByUser = new Map<string, Date>();
for (const g of allGrants) {
  const d = new Date(g.created_at);
  if (!firstGrantByUser.has(g.user_id) || d < firstGrantByUser.get(g.user_id)!) {
    firstGrantByUser.set(g.user_id, d);
  }
}
const newCount = [...firstGrantByUser.values()].filter(d => d >= sinceDate).length;

// revokedCount: последний grant — revoked/expired за period, без active сейчас
const lastGrantByUser = new Map<string, {status: string; updated_at: Date}>();
for (const g of allGrants) {
  const d = new Date(g.created_at);
  const existing = lastGrantByUser.get(g.user_id);
  if (!existing || d > existing.updated_at) { // нужен created_at для сортировки
    lastGrantByUser.set(g.user_id, { status: g.status, updated_at: new Date(g.updated_at) });
  }
}
const revokedCount = [...lastGrantByUser.entries()]
  .filter(([uid, g]) => 
    ['revoked', 'expired'].includes(g.status) && 
    g.updated_at >= sinceDate &&
    !activeSet.has(uid)
  ).length;
```

Но всего записей в клубе ~1112 (546+360+206) — больше 1000, нужна пагинация. Сделаем `range(0,999)` + `range(1000,1999)` или используем RPC.

**Оптимальное решение:** Создать SQL-функцию RPC `get_club_business_stats(p_club_id, p_period_days)` — она вернёт правильные агрегаты без проблемы с лимитом 1000.

### Файл 2: `supabase/migrations/` — новая RPC функция

```sql
CREATE OR REPLACE FUNCTION public.get_club_business_stats(
  p_club_id uuid,
  p_period_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH 
-- Все гранты клуба
grants AS (
  SELECT user_id, status, created_at, updated_at, end_at
  FROM telegram_access_grants
  WHERE club_id = p_club_id
),
-- Уникальные активные участники прямо сейчас
active_users AS (
  SELECT DISTINCT user_id
  FROM grants
  WHERE status = 'active' AND (end_at IS NULL OR end_at > NOW())
),
-- Первый grant каждого пользователя
first_grants AS (
  SELECT user_id, MIN(created_at) AS first_at
  FROM grants
  GROUP BY user_id
),
-- Последний grant каждого пользователя
latest_grants AS (
  SELECT DISTINCT ON (user_id) user_id, status, updated_at
  FROM grants
  ORDER BY user_id, created_at DESC
),
since AS (
  SELECT NOW() - (p_period_days || ' days')::interval AS dt
)
SELECT jsonb_build_object(
  'total_with_access', (SELECT COUNT(*) FROM active_users),
  'new_count', (
    SELECT COUNT(*) FROM first_grants, since
    WHERE first_at >= since.dt
  ),
  'revoked_count', (
    SELECT COUNT(*) FROM latest_grants lg, since
    WHERE lg.status IN ('revoked', 'expired')
      AND lg.updated_at >= since.dt
      AND NOT EXISTS (SELECT 1 FROM active_users au WHERE au.user_id = lg.user_id)
  )
);
$$;
```

### Файл 3: `src/components/telegram/ClubQuickStats.tsx` — обновить подписи

Строка 347: `subtitle="активных grant-ов"` → `subtitle="уникальных участников"`
Строка 374: tooltip добавить "Люди, впервые вступившие в клуб за последние N дней"
Строка 387: tooltip добавить "Не продлили и не вернулись"

## Технические детали

### Тарифы: уже правильно?
Почему BUSINESS 115 вместо реальных 114? Текущий запрос считает **строки subscriptions_v2**, не уникальных user_id. Если у одного юзера 2 активные подписки — считается дважды. Исправить: добавить `COUNT(DISTINCT s.user_id)`.

### Пагинация vs RPC
Всего грантов в клубе: 546 + 360 + 206 = 1112 — превышает лимит Supabase в 1000 строк. Если считать в JS через `.select()`, получим неверные данные. **Поэтому RPC — обязательна.**

## Порядок изменений

1. SQL-миграция: создать RPC `get_club_business_stats`
2. `useClubBusinessStats` hook: заменить 3 отдельных count-запроса на один `.rpc('get_club_business_stats', { p_club_id: clubId, p_period_days: periodDays })`
3. Обновить подписи карточек:
   - "Всего с доступом" subtitle → "уникальных участников"  
   - "Новые" tooltip → "Впервые вступили в клуб за этот период"
   - "Не продлили" tooltip → "Ушли из клуба и не вернулись"
4. Тарифы: добавить `COUNT(DISTINCT user_id)` в запрос подписок

## DoD

- A) "Всего с доступом" = 162 (совпадает с вкладкой "С доступом")
- B) "Новые за 30 дней" = реальное число людей, впервые вступивших, не включает продления
- C) "Не продлили" = реальные потери, вернувшиеся НЕ включены
- D) Тарифы = уникальные пользователи на тариф, сумма ≈ Всего с доступом
- E) Переключатель 7/30/90 дней корректно меняет Новые и Не продлили

## Что не трогаем

- Визуальную часть карточек — симметрия уже правильная
- Переключатель периода — работает
- Таблицу участников, табы, поиск
- "Вне системы" и "Нарушители" — данные из другого хука, считаются правильно
