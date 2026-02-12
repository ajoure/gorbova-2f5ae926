# PATCH TG-P0.9.2 — Wrongful Telegram Kicks After Renewal (Cron/Triggers/Grants)

## Жёсткие правила исполнения для [Lovable.dev](http://Lovable.dev)

1) Ничего не ломать и не трогать лишнее. Только в рамках scope.  

2) Add-only, минимальный diff. Удаления — только если заменяем 1:1 (дубликат/опасная логика).  

3) Dry-run → Execute везде, где есть массовые действия/крон/очереди.  

4) STOP-guards обязательны: лимиты, батчи, таймауты, “abort if >N”, защита сотрудников.  

5) Никаких BEPAID/TG секретов/PII в логах. В audit_logs — только безопасные meta.  

6) DoD только по фактам: (a) SQL-результаты, (b) audit_logs записи, (c) UI-скрины из админки (учётка [7500084@gmail.com](mailto:7500084@gmail.com)), (d) diff-summary.  

7) SYSTEM ACTOR Proof обязателен: должна появиться реальная запись в `audit_logs` с `actor_type='system'`, `actor_user_id=NULL`, `actor_label` заполнен — для каждого execute-шага (миграция/ремонт/крон-фиксы).

---

## Проблема

Пользователей кикает после продления подписки: `subscriptions_v2.access_end_at` продлён, но `telegram_access_grants.end_at` остался старым → крон/проверки считают доступ истёкшим и кикают.

Причины:

- `telegram-cron-sync` использует локальный `hasActiveAccess()` без проверки `subscriptions_v2` → ошибочные AUTOKICK.

- `telegram-check-expired` имеет ветку кика “violators” по `access_status` без валидации активной подписки.

- `trg_subscription_grant_telegram` не срабатывает при renewal (status остаётся `active`), т.к. преждевременно RETURN при UPDATE.

---

## Scope (минимально достаточный)

### Код (2 edge functions)

1) `supabase/functions/telegram-cron-sync/index.ts`

2) `supabase/functions/telegram-check-expired/index.ts`

### БД (1 migration)

3) `supabase/migrations/XXXXXXXXXXXX_tg_grants_on_renewal.sql`:

   - фикс триггера `trg_subscription_grant_telegram` (fire on access_end_at change)

   - data repair для at-risk пользователей (upsert/extend grants до subscription.access_end_at)

### Проверка (read-only)

4) `supabase/functions/telegram-process-access-queue/index.ts` — проверить, что обновляет/UPSERT end_at (если не обновляет — добавить отдельным PATCH внутри этого же спринта, см. ниже “PATCH-опция”).

---

## PATCH-лист (выполнить по порядку)

### PATCH 1 (P0) — `telegram-cron-sync`: убрать неверную проверку доступа

**Файл:** `supabase/functions/telegram-cron-sync/index.ts`

- Удалить локальную функцию `hasActiveAccess()` (которая НЕ смотрит `subscriptions_v2`).

- Подключить shared-валидатор доступа (единый источник истины):

  - импортировать `hasValidAccessBatch` (или общий helper `hasValidAccess()` / `hasValidAccessBatch()` из `_shared/accessValidation.ts`).

- В обработке участников:

  - собрать `user_id` пачкой,

  - вызвать `hasValidAccessBatch(supabase, userIds)` один раз,

  - решения (kick/keep) принимать ТОЛЬКО на основании batch-результата.

- STOP: если batch вернул `unknown/error` по пользователю — НЕ кикать, логировать `AUTO_GUARD_SKIP`.

**DoD маркер:** при попытке автокика писать в `audit_logs`:

- `action='telegram.autokick.attempt'`

- `actor_type='system'`, `actor_user_id=NULL`, `actor_label='telegram-cron-sync'`

- `meta`: `{ reason, access_valid, sub_status?, sub_access_end_at?, grant_end_at?, chat_id?, tg_user_id? }` (без PII)

---

### PATCH 2 (P0) — `telegram-check-expired`: guard перед киком violators

**Файл:** `supabase/functions/telegram-check-expired/index.ts`

- В ветке, где происходит кик “violators” по `access_status`:

  - ДО любого кика вызвать shared-доступ-валидатор (тот же, что в PATCH 1), либо сделать batch-проверку по кандидатам.

  - Если `hasValidAccess=true` (активная подписка / entitlement / manual_access) — НЕ кикать:

    - привести состояние в норму: `telegram_access.access_status='ok'` (если было не ok),

    - при необходимости инициировать regrant/queue (см. PATCH 4).

  - Если `hasValidAccess=false` — кикать как раньше.

**DoD маркер:** при пропуске кика — `audit_logs`:

- `action='telegram.autokick.guard_skip'`

- `actor_type='system'`, `actor_label='telegram-check-expired'`

- `meta`: `{ reason:'valid_access_detected', ... }`

---

### PATCH 3 (P0) — DB trigger: выдавать/обновлять TG grant при renewal

**Миграция:** `supabase/migrations/XXXXXXXXXXXX_tg_grants_on_renewal.sql`

Изменить функцию/триггер `trg_subscription_grant_telegram`:

- На UPDATE НЕ выходить просто потому что `OLD.status in ('active','trial')`.

- Логика:

  - если UPDATE и `NEW.access_end_at` НЕ изменился — `RETURN NEW;`

  - если `NEW.access_end_at` изменился (renewal/extend) — продолжать и ставить grant/queue как при первичной активации.

- Обязательно: защита от дублей — upsert/merge грантов (см. PATCH 4).

**DoD:** SQL-пруф, что после UPDATE access_end_at:

- появляется новая очередь/грант ИЛИ обновляется end_at существующего гранта до нового access_end_at,

- и появляется `audit_logs` запись `actor_type='system'` с label `tg_trigger_renewal` (если триггер уже пишет audit — иначе добавить запись в рамках миграции через безопасную функцию/логирование механизма очереди).

---

### PATCH 4 (P0) — Data repair: синхронизировать grants.end_at с subscriptions.access_end_at

**Миграция (в том же файле):** one-time repair, только для реально “at-risk” (grant_end_at < sub.access_end_at или grant отсутствует)

1) Найти пользователей:

- `subscriptions_v2.status='active'` AND `access_end_at > now()`

- `telegram_access_grants` (source='auto_subscription', status='active') отсутствует ИЛИ `end_at < subscriptions_v2.access_end_at`

2) Исправить:

- UPSERT `telegram_access_grants` (source='auto_subscription', status='active'):

  - `end_at = subscriptions_v2.access_end_at`

  - `start_at = COALESCE(existing.start_at, now())` (или логика системы)

- Если система использует очередь: вместо прямого апдейта — вставить записи в очередь обработки доступа так, чтобы `telegram-process-access-queue` корректно обновил grant.

3) STOP-guard:

- лимит батча (например, 200 за запуск),

- логировать количество затронутых строк,

- dry-run режим (если миграцией нельзя — сделать отдельной edge admin функции; но предпочтительно миграцией с чёткими WHERE).

**Исключения (НЕ ТРОГАТЬ):**

- сотрудники (не менять access/grants):

  - [a.bruylo@ajoure.by](mailto:a.bruylo@ajoure.by)

  - [nrokhmistrov@gmail.com](mailto:nrokhmistrov@gmail.com)

  - [ceo@ajoure.by](mailto:ceo@ajoure.by)

  - [irenessa@yandex.ru](mailto:irenessa@yandex.ru)

**DoD маркер:** `audit_logs`:

- `action='telegram.grants.repair'`

- `actor_type='system'`, `actor_label='tg-grants-repair'`

- `meta`: `{ updated, inserted, batch_limit, dry_run:false }`

---

### PATCH-опция 5 (P1, только если нужно) — `telegram-process-access-queue`: гарантировать UPSERT end_at

**Файл:** `supabase/functions/telegram-process-access-queue/index.ts`

- Если сейчас при наличии активного гранта функция НЕ обновляет end_at:

  - добавить UPSERT по `(user_id, source, status)` или по ключу системы,

  - чтобы `end_at` всегда становился `max(current_end_at, new_end_at)`.

**DoD:** unit-ish проверка через SQL до/после и audit_logs.

---

## Проверки и STOP-gates (обязательные)

### Gate A — “autokick не по подписке”

SQL (пример): выбрать последние AUTOKICK и показать, что перед киком валидатор доступа = false.

- В `audit_logs` должны быть пары:

  - `telegram.autokick.attempt` (или соответствующее событие)

  - и meta содержит `access_valid=false` перед реальным kick.

### Gate B — “renewal обновляет grants”

SQL (прямой пруф):

- до: показать user_id где `grant_end_at < sub.access_end_at`

- после миграции: таких строк = 0

### Gate C — “не кикаем при валидном доступе”

- Запустить `telegram-cron-synctelegram-check-expired` (dry-run, если есть) и доказать, что пользователи с валидным доступом попадают в guard_skip, а не в kick.

---

## UI Smoke (обязательный факт, 3 сценария)

1) Пользователь с продлённой подпиской НЕ теряет Telegram доступ (после даты прежнего grant_end_at).

2) Ручной прогон cron-sync НЕ кикает валидных (есть лог/audit).

3) Если у пользователя реально нет валидного доступа — кик происходит штатно.

Скрины из админки (учётка: [7500084@gmail.com](mailto:7500084@gmail.com)):

- карточка пользователя/доступа Telegram

- лог/audit по событию guard_skip или autokick.attempt

- состояние grants/end_at

---

## Финальный DoD (закрытие патча)

1) **0** случаев, где `subscriptions_v2.access_end_at > now()` и при этом `auto_subscription grant_end_at < access_end_at` (SQL-пруф).  

2) `telegram-cron-sync` больше НЕ использует локальную access-проверку без subscriptions.  

3) `telegram-check-expired` НЕ кикает “violators” без проверки валидного доступа.  

4) Renewal (UPDATE access_end_at) приводит к обновлению/созданию grant (SQL-пруф).  

5) `audit_logs` содержит реальные записи с `actor_type='system'`, `actor_user_id=NULL`, `actor_label` заполнен — для repair и для guard/kick попыток.  

6) Diff-summary: список изменённых файлов + кратко что изменено.

---