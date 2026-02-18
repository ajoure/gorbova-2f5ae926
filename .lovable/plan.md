
# Диагноз по трём проблемам + план правок

## Факты из БД и API (всё проверено)

### Ярошевич walia_777 — КИКНУТА прямо сейчас
API вызов `kick_present` выполнен: `kicked_count: 1`, Telegram ответил `success: true`.
SQL подтвердил: `in_chat: false`, `in_channel: false`, `access_status: removed`.
Проблема была не в гварде — гвард работал правильно (dry_run показал её единственным кандидатом). Проблема была в том, что предыдущие попытки запускались когда `telegram_access_grants` ещё не имел статуса `revoked` после нашего предыдущего SQL-патча.

### Откуда взялся GRANT в 06:01
`telegram_access_queue` получил `action=grant` (без subscription_id) в 06:00:39. Это означает что **какой-то триггер или cron** поставил задачу на выдачу доступа для walia_777. Вероятный источник — `trg_subscription_grant_telegram` или `telegram-reinvite-ghosts`, обнаруживший что её grant ещё не revoked на тот момент.

### Виктория Цалей — "Ожидает входа" 
`telegram_club_members` для клуба 4f8f9d8f (Бухгалтерия): `access_status='ok'`, `in_chat=false`, `in_channel=false`. Подписка `canceled`, все grants `revoked`. Это **устаревшие данные** в `telegram_club_members` — `access_status='ok'` не обновился после отзыва. Карточка UI правильно показывает "Ожидает входа" (строка 2043 ContactDetailSheet.tsx — `access_status === 'ok'` при `in_chat=false`).

**Главная проблема:** `reinvite-ghosts` (строки 92–100 telegram-reinvite-ghosts/index.ts) находит пользователей с `access_status='ok'` AND `in_chat=false OR in_channel=false` — и выдаёт им повторный инвайт. Но `access_status='ok'` может быть устаревшим! Гвард `hasValidAccessBatch` не вызывается перед reinvite.

### Карточка контакта не обновляется
`clubMembership` query (строки 368–388 ContactDetailSheet.tsx) не имеет `refetchOnMount: 'always'`. React Query кеширует результат и не перезапрашивает при повторном открытии карточки.

---

## Правки (4 файла, минимальный diff)

### ПРАВКА 1: `telegram-reinvite-ghosts/index.ts` — hasValidAccessBatch перед reinvite

КРИТИЧНО: `reinvite-ghosts` должен проверять реальный доступ через `hasValidAccessBatch` перед выдачей инвайта. Если `valid=false` — не reinvite, а обновить `access_status` на `no_access` и добавить в очередь на кик.

```typescript
// Добавить импорт:
import { hasValidAccessBatch } from '../_shared/accessValidation.ts';

// После загрузки ghosts (строка ~100), перед циклом:
const profileIds = (ghosts || []).filter(g => g.profile_id).map(g => g.profile_id);
const { data: profileRows } = await supabase
  .from('profiles').select('id, user_id').in('id', profileIds);
const profileToUserId = new Map((profileRows || []).map(p => [p.id, p.user_id]));
const userIds = [...new Set(profileIds.map(id => profileToUserId.get(id)).filter(Boolean))];
const accessMap = userIds.length > 0 
  ? await hasValidAccessBatch(supabase, userIds, club.id) 
  : new Map();

// В цикле for (const ghost of ghosts):
const ghostUserId = profileToUserId.get(ghost.profile_id);
const accessResult = ghostUserId ? accessMap.get(ghostUserId) : null;

if (!accessResult?.valid) {
  // Нет реального доступа → обновить status, не приглашать
  await supabase.from('telegram_club_members').update({
    access_status: 'no_access',
    updated_at: new Date().toISOString(),
  }).eq('id', ghost.id);
  totalSkipped++;
  continue;
}
// ... далее обычная логика reinvite
```

### ПРАВКА 2: `ContactDetailSheet.tsx` — автообновление при открытии

```typescript
// Строки 368–388: добавить refetchOnMount: 'always' и staleTime: 0
const { data: clubMembership, refetch: refetchClubMembership } = useQuery({
  queryKey: ["contact-club-membership", contact?.id],
  queryFn: async () => { ... },
  enabled: !!contact?.id && !!contact?.telegram_user_id,
  staleTime: 0,          // ← всегда считать устаревшим
  refetchOnMount: true,  // ← перезапрашивать при каждом открытии
});
```

Дополнительно: добавить кнопку "Обновить" рядом со строкой "Клуб:" в Telegram-вкладке.

### ПРАВКА 3: `ContactDetailSheet.tsx` — правильный badge для "нет реального доступа"

Строки 2043–2053: когда `access_status='ok'` но `in_chat=false` AND `in_channel=false`, показывать "Ожидает входа" — это правильно. Но если `clubMembership` возвращает запись из **другого клуба** (Бухгалтерия вместо Горбова), это вводит в заблуждение.

Нужно сортировать по приоритету: сначала `Gorbova Club` (`fa547c41`), потом остальные. RPC `admin_get_club_membership` возвращает один результат — нужно убедиться что он возвращает наиболее релевантный клуб (с activity/access).

### ПРАВКА 4: SQL — исправить stale data для Виктории Цалей

Виктория в Бухгалтерии (4f8f9d8f): `access_status='ok'` при отсутствии реального доступа → исправить вручную через миграцию:

```sql
UPDATE telegram_club_members
SET access_status = 'no_access', updated_at = NOW()
WHERE id = '55b41a07-d929-4167-8e18-9d6bbd294f3b';
-- Виктория Цалей в клубе Бухгалтерия: подписка canceled, нет реального доступа
```

После этого: карточка покажет "Удалён" вместо "Ожидает входа", и `reinvite-ghosts` не будет её трогать.

---

## Таблица правок

| # | Файл | Строки | Изменение |
|---|------|--------|-----------|
| 1 | `telegram-reinvite-ghosts/index.ts` | 1, 92–120 | Добавить hasValidAccessBatch перед reinvite; пропускать пользователей без реального доступа и обновлять им `access_status='no_access'` |
| 2 | `ContactDetailSheet.tsx` | 368–388 | `staleTime: 0`, `refetchOnMount: true` для clubMembership query |
| 3 | `ContactDetailSheet.tsx` | 2035–2054 | Добавить кнопку "Обновить" рядом с badge клуба |
| 4 | SQL миграция | — | UPDATE telegram_club_members SET access_status='no_access' WHERE id='55b41a07...' |

## Что НЕ меняем

- `accessValidation.ts` — уже правильный (state=revoked фильтрует)
- `telegram-kick-violators/index.ts` — работает корректно
- `telegram-revoke-access/index.ts` — правильный (ставит past time)
- Логику kick/kick_present — гвард работает
- `telegram_club_members.access_status` для walia_777 — уже `removed`

## DoD

- A) `reinvite-ghosts` больше не выдаёт инвайты пользователям без реального доступа (valid=false)
- B) Виктория Цалей: `access_status='no_access'`, карточка показывает "Удалён" вместо "Ожидает входа"
- C) Карточка контакта при каждом открытии перезапрашивает `clubMembership`
- D) Ярошевич: `in_chat=false`, `in_channel=false` — SQL пруф уже получен

## Текущий статус

Ярошевич **уже кикнута** (API-вызов в рамках анализа). SQL подтверждает:
`in_chat: false`, `in_channel: false`, `access_status: removed`, `updated_at: 2026-02-18 18:45:42`.

Для полного закрытия темы нужны 4 правки выше: чтобы cron больше не выдавал ей доступ, и чтобы Виктория Цалей не застряла в "Ожидает входа".
