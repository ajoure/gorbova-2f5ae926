

# PATCH P0.9.8 — One-time invite link tracking + Entry verification + Mass Reinvite UI

## Текущее состояние (результаты расследования)

**Что уже работает:**
- `telegram-grant-access` УЖЕ генерирует одноразовые ссылки (`member_limit=1`, `expire_date=24h`) — строки 101-104
- `telegram_club_members` УЖЕ имеет поля: `invite_sent_at`, `invite_status`, `last_invite_link`, `invite_error`, `invite_retry_after`
- Tab "Купили, не зашли" (`bought_not_joined`) УЖЕ есть в UI

**Что НЕ работает (корневые проблемы):**
1. Ссылки не сохраняются в отдельную таблицу — нет истории, нет трекинга "кто зашёл по какой ссылке"
2. Webhook НЕ обрабатывает `chat_member` update (когда пользователь заходит/выходит из чата). Обрабатывается только `my_chat_member` (статус бота) и `chat_join_request` (заявки на вход). Поэтому `in_chat`/`in_channel` не обновляются автоматически
3. Нет поля `verified_in_chat_at` — система не отличает "ссылку отправили" от "реально вошёл"
4. Нет кнопки массовой переотправки в UI
5. Нет cron для автоматической переотправки "призракам"
6. Нет MISMATCH-детекции (если по ссылке зашёл другой TG-пользователь)

**Факт:** 25 пользователей с `access_status=ok` и `in_chat=false`, 27 с `invite_status=sent` и `in_chat=false`. Всего 405 записей в `telegram_club_members`.

**Конфликт имён:** Таблица `telegram_invites` уже существует — это промо-коды администратора (страница TelegramInvites.tsx). Новая таблица для трекинга персональных ссылок будет называться `telegram_invite_links`.

---

## A) База данных (SQL миграции)

### A1. Новая таблица `telegram_invite_links`

```text
telegram_invite_links:
  id uuid PK default gen_random_uuid()
  club_id uuid NOT NULL FK -> telegram_clubs(id)
  profile_id uuid NOT NULL FK -> profiles(id)
  telegram_user_id bigint NULL  -- ожидаемый TG ID (если привязан)
  invite_link text NOT NULL     -- полная ссылка от Telegram API
  invite_code text NOT NULL     -- хвост ссылки для матчинга (после + или /joinchat/)
  target_type text NOT NULL DEFAULT 'chat'  -- 'chat' | 'channel'
  target_chat_id bigint NOT NULL  -- chat_id или channel_id
  status text NOT NULL DEFAULT 'created'  -- created|sent|used|expired|revoked|mismatch
  created_at timestamptz DEFAULT now()
  sent_at timestamptz NULL
  used_at timestamptz NULL
  used_by_telegram_user_id bigint NULL  -- кто реально вошёл
  expires_at timestamptz NOT NULL
  member_limit int NOT NULL DEFAULT 1
  source text NULL  -- 'auto_grant' | 'manual_grant' | 'reinvite' | 'cron_reinvite'
  source_id text NULL  -- order_id, subscription_id, etc.
  note text NULL

  Индексы:
  - (club_id, profile_id, created_at DESC)
  - invite_code (unique or indexed)
  - (status, expires_at) -- для cron expire
```

RLS: только admin/superadmin через has_role.

### A2. Новые поля в `telegram_club_members`

Добавить (ALTER TABLE ADD COLUMN IF NOT EXISTS):
- `last_invite_id uuid NULL` -- FK -> telegram_invite_links(id)
- `verified_in_chat_at timestamptz NULL`
- `verified_in_channel_at timestamptz NULL`
- `last_verified_at timestamptz NULL`
- `reinvite_count int DEFAULT 0` -- счётчик переотправок за последние 24ч

### A3. Cron: expire старых invite_links

Функция `expire_stale_invite_links()`:
- UPDATE telegram_invite_links SET status='expired' WHERE status IN ('created','sent') AND expires_at < now()
- Регистрация через pg_cron каждый час

---

## B) Edge Functions — Telegram API логика

### B1. telegram-grant-access/index.ts — сохранение ссылок в `telegram_invite_links`

**Точка изменения:** после `createInviteLink()` (строки 388-408 для чата, 419-438 для канала)

Текущий код создает ссылку и сохраняет только в `last_invite_link` (строка 532). Нужно:

1. После `createInviteLink()` — извлечь `invite_code` из URL:
   - Формат: `https://t.me/+XXXXXX` -> код = `XXXXXX`
   - Или: `https://t.me/joinchat/XXXXXX` -> код = `XXXXXX`

2. INSERT в `telegram_invite_links`:
   - club_id, profile_id (получить из profile.id), telegram_user_id
   - invite_link, invite_code, target_type ('chat'/'channel'), target_chat_id
   - status='sent', sent_at=now(), expires_at=now()+24h, member_limit=1
   - source: из параметра (is_manual ? 'manual_grant' : 'auto_grant')
   - source_id: из body.source_id

3. UPDATE telegram_club_members SET last_invite_id = новый ID

**Diff минимальный:** ~20 строк добавления после каждого createInviteLink.

### B2. telegram-webhook/index.ts — обработка `chat_member` update

**Важно:** Telegram отправляет `chat_member` update (не путать с `my_chat_member`) когда пользователь входит/выходит из группы. Но бот получает его **только если включены** `chat_member` updates через `allowed_updates` при setWebhook.

Добавить НОВЫЙ блок обработки (после `chat_join_request`, ~строка 480):

```text
if (update.chat_member) {
  const chatMember = update.chat_member;
  const telegramUserId = chatMember.new_chat_member.user.id;
  const chatId = chatMember.chat.id;
  const newStatus = chatMember.new_chat_member.status;
  const oldStatus = chatMember.old_chat_member.status;
  const inviteLink = chatMember.invite_link; // может быть undefined

  // Пользователь ВОШЁЛ в чат/канал
  if (['member', 'administrator'].includes(newStatus) && 
      ['left', 'kicked', 'restricted'].includes(oldStatus)) {
    
    // 1. Найти club по chat_id
    // 2. Обновить telegram_club_members: in_chat=true (или in_channel), 
    //    verified_in_chat_at=now(), last_verified_at=now()
    // 3. Если inviteLink есть — найти в telegram_invite_links по invite_code,
    //    обновить status='used', used_at=now(), used_by_telegram_user_id
    // 4. MISMATCH check: если invite_link.telegram_user_id != telegramUserId
    //    -> status='mismatch', audit INVITE_MISMATCH
    // 5. Audit: JOIN_VERIFIED
  }

  // Пользователь ВЫШЕЛ из чата/канала
  if (['left', 'kicked'].includes(newStatus) && 
      ['member', 'administrator'].includes(oldStatus)) {
    // Обновить telegram_club_members: in_chat=false, verified_in_chat_at=null
    // Audit: MEMBER_LEFT / MEMBER_KICKED
  }
}
```

**Критично:** Нужно обновить webhook registration (setWebhook) чтобы включить `chat_member` в `allowed_updates`. Это делается через Telegram Bot API:
- `setWebhook` с `allowed_updates: ["message", "chat_member", "my_chat_member", "chat_join_request"]`
- Это можно сделать через существующий `telegram-bot-actions` или один раз вручную

### B3. Новая Edge Function: `telegram-reinvite-ghosts` (cron, каждые 6 часов)

Логика:
1. Найти кандидатов:
   - `access_status IN ('ok')` AND `(in_chat=false OR in_channel=false)`
   - `invite_sent_at < now() - interval '4 hours'` (или `invite_sent_at IS NULL`)
   - Есть активная подписка/entitlement/manual_access для ЭТОГО клуба (через product_club_mappings)
   - `reinvite_count < 3` за последние 24ч (анти-спам)
2. Лимит: 20 за запуск
3. Для каждого:
   - Сначала getChatMember — проверить, может уже в чате (данные устарели)
   - Если уже в чате: обновить in_chat=true, verified_in_chat_at=now(), SKIP
   - Если НЕ в чате: unban (если kicked) + createInviteLink + sendMessage DM + записать telegram_invite_links
4. STOP-guards: 80s runtime, rate-limit detection, error threshold 20%

Зарегистрировать в `supabase/functions.registry.txt` и pg_cron.

### B4. telegram-club-members/index.ts — новый action 'reinvite_ghosts'

Добавить action для вызова из UI (кнопка "Переотправить"):
- Принимает `club_id` и опциональный `member_ids[]`
- dry_run mode: возвращает список кандидатов + причины skip
- execute mode: ставит в очередь `telegram_access_queue` с action='reinvite'

---

## C) UI: TelegramClubMembers.tsx

### C1. Кнопка "Переотправить ссылки" на табе "Купили, не зашли"

Появляется когда `activeTab === 'bought_not_joined'`:
- Первый клик: DRY-RUN модалка:
  - "Будет отправлено: N"
  - "Пропущено (лимит переотправок): M"
  - "Пропущено (отправлено < 4ч назад): K"
- Подтверждение: вызов `telegram-club-members` action='reinvite_ghosts' с execute mode
- Прогресс и результат

### C2. Улучшить invite_status в таблице

В колонке "Статус доступа" или отдельной колонке показывать:
- Зелёный: verified (in_chat=true, verified_in_chat_at != null)
- Жёлтый: sent (invite_status=sent, in_chat=false)
- Красный: expired/mismatch
- Серый: none

### C3. Индивидуальная кнопка "Переотправить" в dropdown меню участника

В DropdownMenu каждого участника (строка ~MoreHorizontal) добавить пункт:
- "Переотправить ссылку" — доступен если `in_chat=false` и `link_status=linked`

---

## D) Webhook registration: включить `chat_member` updates

Нужно один раз вызвать Telegram API `setWebhook` с расширенным `allowed_updates`:

```text
allowed_updates: ["message", "chat_member", "my_chat_member", "chat_join_request"]
```

Это можно реализовать:
- Добавить action 'update_webhook' в `telegram-bot-actions` Edge Function
- Или выполнить при деплое `telegram-reinvite-ghosts` (одноразовый setup)

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| SQL миграция | Таблица `telegram_invite_links` + поля в `telegram_club_members` + cron expire |
| `supabase/functions/telegram-grant-access/index.ts` | +30 строк: INSERT в telegram_invite_links после createInviteLink |
| `supabase/functions/telegram-webhook/index.ts` | +80 строк: обработка `chat_member` update (вход/выход + mismatch) |
| `supabase/functions/telegram-reinvite-ghosts/index.ts` | Новый файл: cron переотправки "призракам" |
| `supabase/functions/telegram-club-members/index.ts` | +60 строк: action 'reinvite_ghosts' (dry_run + execute) |
| `supabase/functions/telegram-bot-actions/index.ts` | +15 строк: action 'update_webhook' (allowed_updates) |
| `src/pages/admin/TelegramClubMembers.tsx` | +100 строк: кнопка "Переотправить", улучшенная индикация invite_status |
| `supabase/functions.registry.txt` | Добавить `telegram-reinvite-ghosts` |

## Последовательность выполнения

1. SQL миграция: таблица + поля + cron
2. `telegram-bot-actions`: добавить update_webhook action
3. `telegram-grant-access`: сохранять ссылки в telegram_invite_links
4. `telegram-webhook`: обработка chat_member (вход/выход + mismatch)
5. `telegram-reinvite-ghosts`: новый cron
6. `telegram-club-members`: action reinvite_ghosts
7. UI: кнопка + индикация
8. Вызвать update_webhook для активного бота (включить chat_member updates)
9. Проверка: отправить ссылку тестовому пользователю, зайти по ней, убедиться что verified_in_chat_at проставился

## STOP-guards

- reinvite cron: max 20 за запуск, 80s runtime cap, rate-limit detection
- массовая кнопка UI: max 50 за раз, dry-run обязателен перед execute
- reinvite_count: max 3 за 24ч на одного пользователя
- MISMATCH: не кикать автоматически, только пометить + audit
- expire cron: только status IN ('created','sent'), batch 500

## DoD

1. Инвайт-ссылки сохраняются в `telegram_invite_links` при каждой генерации (SQL-пруф: SELECT count FROM telegram_invite_links)
2. При входе пользователя в чат — webhook обновляет `in_chat=true`, `verified_in_chat_at=now()`, invite_link status='used' (лог webhook)
3. При входе "чужого" — статус invite='mismatch', запись INVITE_MISMATCH в audit
4. Кнопка "Переотправить всем не вошедшим" работает: dry-run показывает список, execute отправляет ссылки
5. Cron `telegram-reinvite-ghosts` каждые 6ч переотправляет ссылки (лог cron + audit)
6. `allowed_updates` включает `chat_member` (подтверждение через getWebhookInfo)
7. UI: статусы "В чате"/"Ссылка отправлена"/"Не вошёл" отображаются корректно


PATCH P0.9.8 — ДОПОЛНЕНИЯ (обязательные)

1) Не использовать telegram_club_members.reinvite_count (не вводить). Лимит переотправок считать запросом к telegram_invite_links:
   count(*) where club_id=? and profile_id=? and sent_at > now()-interval '24 hours'
   and source in ('reinvite','cron_reinvite').

2) telegram-webhook chat_member:
   - invite_link может быть undefined. В этом случае:
     a) verified_in_chat_at / verified_in_channel_at обновлять по tg_user_id ↔ profile mapping.
     b) telegram_invite_links НЕ обновлять в status=used без invite_code match.
   - status=used обязателен только при наличии invite_link и успешном match.

3) MISMATCH:
   - если invite_link найден и telegram_invite_links.telegram_user_id != фактический tg_user_id → status=mismatch + audit INVITE_MISMATCH (без автокика).
   - если invite_link отсутствует, но профилю уже привязан ожидаемый telegram_user_id и он != фактическому → audit INVITE_MISMATCH_WEAK.
   - STOP-guard: если по (club_id, profile_id) mismatch >= 2 за 24h → блокировать auto reinvite на 24h, показывать в UI бейдж “Security review”.

4) telegram-bot-actions update_webhook:
   - idempotent: сначала getWebhookInfo, если chat_member уже включён → no-op.
   - audit_log telegram.webhook.updated только если реально обновили.

5) reinvite_ghosts action:
   - принимает scope: bought_not_joined | all_not_in_chat | selected_ids.
   - DRY-RUN обязателен перед execute.
   - execute возвращает queued_count + skipped breakdown.

