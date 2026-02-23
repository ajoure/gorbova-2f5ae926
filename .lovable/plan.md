

# Исправление: админы-нарушители, переключатель периода, счетчик админов

## Проблемы

### 1. Админы попадают в нарушители
SQL-функция `get_club_members_enriched` вычисляет `is_violator = in_any AND NOT has_active_access`. Администраторы клуба (Сергей Федорчук, Катерина Горбова) физически в чате, но если у них нет active access grant -- они считаются нарушителями. Это неправильно: администраторы Telegram не подлежат удалению.

**Решение:** На фронтенде исключить админов из нарушителей. В `TelegramClubMembers.tsx`:
- При подсчете `counts.violators` исключать участников, чей `telegram_user_id` есть в `adminTelegramIds`
- При фильтрации для вкладки `violators` -- аналогично
- В карточке "Нарушители" в `ClubQuickStats` -- передавать скорректированное число

### 2. Переключатель 7/30/90 дней ни на что не влияет
`ClubQuickStats` имеет свой локальный state `period`, который никуда не передается. Родительский компонент `TelegramClubMembers` имеет `businessStatsPeriod` + `setBusinessStatsPeriod`, передает период в `useClubBusinessStats`, но НЕ передает эти значения в `ClubQuickStats`.

**Решение:**
- Добавить в `ClubQuickStatsProps` проп `period` и `onPeriodChange`
- В `TelegramClubMembers.tsx` передать `businessStatsPeriod` и `setBusinessStatsPeriod`
- Убрать локальный `useState(30)` из `ClubQuickStats`

### 3. Админов показывает 3, а не 4
В БД этого клуба бот НЕ записан как member с ролью administrator. Хук `useClubAdmins` ищет только в `telegram_club_members`. Бот (link-бот) не проходит sync как участник, поэтому его нет в таблице.

**Решение:** Расширить хук `useClubAdmins`: помимо поиска в `telegram_club_members`, также подтянуть ботов, привязанных к клубу через таблицу `telegram_bots` (или `telegram_club_bots`), и добавить их в список администраторов с ролью `administrator` и флагом `is_bot = true`.

---

## Технический план

### Файл: `src/hooks/useClubAdmins.ts`

1. После получения админов из `telegram_club_members`, дополнительно запросить ботов, привязанных к клубу
2. Добавить ботов в результирующий массив с `role: "administrator"`, `is_bot: true`
3. Исключить дубликаты (если бот уже найден как member)

### Файл: `src/components/telegram/ClubQuickStats.tsx`

4. Добавить пропсы `period: number` и `onPeriodChange: (v: number) => void`
5. Убрать локальный `useState(30)` для `period`
6. Использовать пропсы для `PeriodSwitcher`

### Файл: `src/pages/admin/TelegramClubMembers.tsx`

7. **Исключить админов из нарушителей**: в `counts.violators` и в фильтре вкладки `violators` добавить условие `&& !adminTelegramIds.has(m.telegram_user_id)`
8. **Передать period** в `ClubQuickStats`: `period={businessStatsPeriod}` и `onPeriodChange={setBusinessStatsPeriod}`
9. **Передать скорректированный violatorsCount** в `ClubQuickStats`: вычислять на основе `members`, исключая админов

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/hooks/useClubAdmins.ts` | Добавить ботов клуба в список админов |
| `src/components/telegram/ClubQuickStats.tsx` | Пропсы period/onPeriodChange вместо локального state |
| `src/pages/admin/TelegramClubMembers.tsx` | Исключить админов из нарушителей, передать period, скорректировать violatorsCount |

## НЕ трогаем

- SQL-функции `get_club_members_enriched`, `search_club_members_enriched` -- is_violator остается как есть в БД
- RPC `get_club_business_stats`
- Edge-функции `telegram-club-members`, `telegram-kick-violators`
- Хук `useTelegramIntegration`

## DoD

1. Администраторы клуба (creator, administrator) НЕ попадают в "Нарушители"
2. Переключатель 7/30/90 дней влияет на данные "Динамика" (Новые, Не продлили)
3. Вкладка "Админы" показывает 4 (включая бота)
4. Логика работает для всех клубов
5. Нет ошибок сборки/TS

