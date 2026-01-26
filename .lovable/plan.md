ЖЁСТКИЕ ПРАВИЛА ИСПОЛНЕНИЯ ДЛЯ LOVABLE.DEV
- Ничего не ломать и не трогать лишнее. Только add-only или точечные правки по месту.
- Сначала DRY-RUN, затем EXECUTE. Любые массовые операции — только через инструменты с dry_run=true по умолчанию.
- Никаких хардкод-UUID, кроме явно указанных в этом ТЗ как предмет чистки (tariff_price 110).
- Идемпотентность обязательна: дедуп по provider_payment_id / transaction.uid / bepaid_uid.
- STOP-предохранители: лимиты, батчи, max-rows, подтверждение на execute.
- Безопасность: строгая проверка ролей/RBAC, запрет “silent impersonation”.
- Финальный отчёт DoD: SQL-пруфы, audit_logs (SYSTEM ACTOR proof), список изменённых файлов + diff-summary.

============================================================================
СПРИНТ: PAYMENTS / STATEMENT / TIMEZONE / TRIAL BUGS
============================================================================

СТАТУС СИСТЕМЫ (DoD SQL проверки — исходные данные)
- Дубликаты payments_v2 по UID: 0 (OK)
- Orphan payments 2026+: 1 (FIX REQUIRED)
- Order/Payment amount mismatch: 2 (FIX REQUIRED)
- Подписки с 110 BYN: 0 (OK)
- tariff_price 110 BYN: 1 запись (is_active=false) (FIX REQUIRED)

============================================================================
PATCH-10 (BLOCKER, FIRST): SECURITY — roles / admin routing / impersonation / whoami
Цель: невозможно оказаться в /admin без роли, невозможна “тихая” impersonation, критические тулзы показывают whoami и пишут в audit.

10.1 Исправить маршруты
- Обернуть ВСЕ /admin/* роуты в AdminLayout (не только часть).
- ProtectedRoute не считать достаточным: AdminLayout обязателен в дереве роутов для /admin.

Files:
- src/App.tsx
Tasks:
- Найти все Route, начинающиеся с /admin
- Убедиться, что каждый из них вложен в элемент, который проверяет hasAdminAccess() (AdminLayout).
- Добавить unit-ish sanity: если путь startsWith('/admin') и нет admin access -> redirect + toast.

10.2 Whoami в критических тулзах
- Добавить отображение текущего пользователя и ролей в:
  - Backfill2026OrdersTool
  - Purge tool dialog (если есть UI)
  - Materialize queue tool (если есть UI)
- Формат: email, user_id, roles codes.

Files:
- src/components/admin/payments/Backfill2026OrdersTool.tsx
- (если существуют) src/components/admin/payments/Purge*.tsx, Materialize*.tsx

10.3 Audit “suspicious state”
- В ImpersonationBar: если найден admin_session_backup при отсутствии is_impersonating=true (backward/bug compat) — это suspicious.
- Записать audit_logs (SYSTEM ACTOR) action='auth.suspicious_state_detected' meta включает:
  - has_admin_session_backup=true
  - is_impersonating_flag_present
  - current_user_email/user_id (если доступно)
  - url, timestamp

Files:
- src/components/layout/ImpersonationBar.tsx

10.4 Audit meta в Edge tools
- В admin-backfill-2026-orders: audit_logs meta дополняем:
  - requested_by_user_id
  - requested_by_email
  - requested_by_roles (если доступно)
  - dry_run, limit, totals

Files:
- supabase/functions/admin-backfill-2026-orders/index.ts

DoD PATCH-10:
- Любая попытка открыть /admin без admin роли => редирект всегда (для всех /admin/*).
- “Silent impersonation” невозможно: bar всегда виден если backup есть.
- Whoami отображается в тулзах.
- audit_logs содержит auth.suspicious_state_detected (SYSTEM ACTOR) при детекте.

============================================================================
PATCH-6 (BLOCKER): Phantom tariff_price=110 BYN — устранить и запретить чтение неактивных цен
Цель: код нигде не читает is_active=false цены; запись 110 удалена/архивирована безопасно; guard на multiple active prices.

6.1 UI fix: AdminChargeDialog должен фильтровать is_active=true
Files:
- src/components/admin/AdminChargeDialog.tsx
Task:
- Добавить .eq('is_active', true) в запрос tariff_prices.

6.2 Guard: multiple active prices
Files:
- supabase/functions/subscription-charge/index.ts
Tasks:
- Проверить количество активных цен для tariff_id.
- Если count>1 => STOP: вернуть error + audit_logs (SYSTEM ACTOR) action='subscription.multiple_active_prices_error'.

6.3 DB cleanup: tariff_price 110 (id указан) + audit
- Выполнить safe cleanup:
  A) DRY-RUN: проверить зависимые ссылки/упоминания (FK/meta/logs).
  B) EXECUTE: удалить или заархивировать запись (предпочесть DELETE только если нет FK; иначе soft delete: set deleted_at).
  C) Записать audit_logs (SYSTEM ACTOR) action='tariff_price.deleted' или 'tariff_price.archived'.

UUID:
- 0633f728-8bfe-448c-88e0-580ff1676e99

DoD PATCH-6:
- AdminChargeDialog никогда не показывает/не выбирает is_active=false цены.
- subscription-charge никогда не использует неактивные цены.
- tariff_price 110 отсутствует (или archived) и не участвует в расчётах.
- audit_logs содержит запись cleanup.

============================================================================
PATCH-8 (BLOCKER): TIMEZONE — единое правило времени + per-user timezone + UI toggle
Цель: bePaid/API/import/UI показывают согласованное время; TZ настраивается у пользователя; импорт явно фиксирует assumed TZ; хранение — UTC.

8.1 DB: profiles.timezone (IANA)
- Добавить колонку timezone TEXT, default = 'Europe/Warsaw' (или строго: 'Europe/Minsk' если именно bePaid-аккаунт Минск; но user default лучше Warsaw).
- Хранить IANA string.

SQL migration:
- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Warsaw';
- COMMENT ON COLUMN profiles.timezone IS 'IANA timezone string for UI display';

8.2 UI settings: выбор timezone в настройках пользователя
- Добавить dropdown (минимум: Europe/Warsaw, Europe/Minsk, UTC).
- При сохранении пишет в profiles.timezone.

Files:
- src/components/settings/ProfileSettings.tsx (или создать новый экран)

8.3 Payments UI: переключатель отображения времени
- Toggle: 'user' | 'utc' | 'provider'
- Для provider: использовать meta.provider_timestamp_raw если есть; иначе fallback к paid_at UTC с пометкой.

Files:
- src/components/admin/payments/PaymentsTabContent.tsx (или где рендерится таблица)

8.4 Webhook: сохранять raw provider time + assumed TZ в meta
- В payments_v2.meta добавлять:
  - provider_timestamp_raw
  - provider_timezone_assumed
  - parsed_paid_at_utc
  - parse_warnings (если были)
- Гарантия: payments_v2.paid_at хранится в UTC (TIMESTAMPTZ).

Files:
- supabase/functions/bepaid-webhook/index.ts

8.5 Import UI: явный timezone при импорте (пока импорт не переделан — минимум добавить selector)
- В BepaidImportDialog добавить выбор TZ (Europe/Minsk / UTC).
- Сохранять выбранный TZ в statement_lines/source_timezone (см PATCH-7) или в meta очереди, пока staging не внедрён.

Files:
- src/components/admin/bepaid/BepaidImportDialog.tsx

DoD PATCH-8:
- У профиля есть timezone; UI показывает время корректно для user/utc/provider.
- У каждого платежа есть provider raw time в meta (для новых webhook платежей).
- Нет “съезда дат/времени” при сравнении API vs UI (в пределах допустимого).

============================================================================
PATCH-7 (BLOCKER): STATEMENT / IMPORT — идемпотентность, staging, запрет 2026+ без UID
ВАЖНО: импорт НЕ удаляем. Рефакторим в безопасный reconcile pipeline.

7.1 Unique constraint: payments_v2(provider, provider_payment_id) where provider_payment_id not null
SQL:
- CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_v2_provider_uid
  ON payments_v2(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

7.2 Staging: statement_lines
SQL:
- Создать таблицу statement_lines с UNIQUE(provider, stable_key).
- stable_key = provider_payment_id если есть, иначе composite key (paid_at_utc + amount + last4 + rrn/approval_code если доступно).
- Поля: raw_data, parsed_amount, parsed_status, parsed_at, source, source_timezone, processed_at, payment_id, error.

7.3 Импорт: писать в statement_lines, не напрямую в reconcile_queue
Files:
- src/components/admin/bepaid/BepaidImportDialog.tsx
Tasks:
- Парсинг файла => upsert в statement_lines по (provider, stable_key).
- Добавить preview dry-run: сколько новых/обновлённых строк.

7.4 Materialize: отдельная функция materialize-statement-lines
- Новый Edge Function: admin-materialize-statement-lines
- Делает:
  - advisory lock по stable_key/provider_payment_id
  - upsert payments_v2 по (provider, provider_payment_id)
  - строгий guard: для paid_at >= 2026-01-01 provider_payment_id MUST (иначе error + audit + skip)
  - связывает с orders_v2 по правилам (charge creates/updates order, refund updates status)
  - записывает audit summary

Files:
- NEW: supabase/functions/admin-materialize-statement-lines/index.ts

7.5 Усилить существующий admin-materialize-queue-payments (минимум-guard на 2026+)
Files:
- supabase/functions/admin-materialize-queue-payments/index.ts
Task:
- Если нет item.bepaid_uid и paid_at >= 2026-01-01 => audit payment.import_rejected_missing_uid + skip.

DoD PATCH-7:
- Повторный импорт одного файла не создаёт дублей.
- Нельзя создать payments_v2 2026+ без provider_payment_id.
- Есть staging + materialize с dry-run/execute.
- orphan payments 2026+ уменьшаются до 0 после reconcile.

============================================================================
PATCH-2 (BLOCKER): TRIAL / AMOUNT GUARDS / TRIAL BLOCKS + кейс Платоновой как БАГ
ВАЖНО: трактуем кейс Платоновой как баг системы (последующее автосписание/артефакты), и фиксируем предотвращение повторения.

2.1 Trial blocks DB
SQL:
- Создать trial_blocks (user_id unique where removed_at is null), RLS on.
- Поля: reason, created_at, expires_at, removed_at, removed_by.

2.2 Webhook: trial guard + блокировка повторного trial + “amount mismatch” STOP
Files:
- supabase/functions/bepaid-webhook/index.ts
Tasks:
- При amount в зоне trial (например 1 BYN или <5 BYN):
  - проверить активную подписку по user_id+product_id (active/trial/grace)
  - проверить trial_blocks (active block)
  - если activeSub или trialBlock:
    - НЕ создавать order
    - пометить payment.meta.ignored_reason='trial_blocked'
    - audit_logs SYSTEM ACTOR action='payment.trial_blocked'
    - вернуть response status trial_blocked
- Amount mismatch guard:
  - если найден существующий order и order.is_trial=true, а amount>5 => STOP + audit payment.mismatch_amount_guard_triggered
  - если amount==1, а попытка обработать как renewal => STOP + audit
- Везде использовать dedup по transaction.uid (provider_payment_id).

2.3 Admin refund flow: при возврате trial создавать trial_block + корректно стопать хвосты
Files:
- (найти где реализован refund/void) src/components/admin/payments/*Actions*.tsx + соответствующая Edge Function если есть
Tasks:
- При admin refund trial:
  - order.status => refunded/cancelled
  - subscription/autorenew связанные с этим trial => disabled/cancelled (без дальнейших списаний)
  - insert trial_block (например expires_at = now()+30d) + audit

2.4 Fix current data issues: 1 orphan + 2 mismatches
- Создать админ-инструмент “Fix Orphans & Mismatches (2026+)” с dry-run/execute:
  - кандидат: orphan payments 2026+ (succeeded, amount>0, profile_id not null, order_id null)
    -> создать/привязать order корректной суммы (НЕ trial) или пометить needs_mapping
  - кандидат: mismatches где payment.amount != order.final_price
    -> исправить order.final_price (если очевидно) или пометить needs_mapping
- Все изменения — с audit_logs и лимитами.

Files:
- NEW: src/components/admin/payments/FixPaymentsIntegrityTool.tsx
- NEW: supabase/functions/admin-fix-payments-integrity/index.ts

DoD PATCH-2:
- Невозможно появление “сделки на 1 BYN” из non-trial платежа.
- Повторный trial для активного клиента блокируется.
- Refund trial не оставляет хвост автосписаний.
- После запуска fix-tool: orphan=0, mismatches=0 (либо все оставшиеся помечены needs_mapping с явным списком).

============================================================================
PATCH-9 (BLOCKER): NIGHTLY invariants + отчёт в Inbox (без отдельной вкладки уведомлений)
9.1 Edge Function nightly-payments-invariants
- Проверки:
  INV-1 duplicates by (provider, provider_payment_id)
  INV-2 orphan payments 2026+
  INV-3 amount mismatches
  INV-4 trial/non-trial mismatch guards violations (по audit_logs counters)
  INV-5 multiple active prices / use of inactive prices (по audit_logs + прямые выборки)
  INV-6 timezone drift warnings (если реализовано в meta)
- Результат:
  - audit_logs SYSTEM ACTOR action='nightly.payments_invariants_run' meta summary + samples
  - создать сообщение в Admin Inbox/Communication thread (в существующей ленте), полный текст + JSON summary

Files:
- NEW: supabase/functions/nightly-payments-invariants/index.ts

9.2 Cron
- Настроить cron.schedule на 04:00 UTC.
- Секреты/Authorization хранить безопасно (не хардкод в SQL; использовать vault/secret ref).

DoD PATCH-9:
- Nightly job реально исполняется (audit proof).
- В Inbox появляется отчёт.
- При регрессе видно конкретные sample ids.

============================================================================
PATCH-1 / PATCH-3 / PATCH-4 / PATCH-5 (ALREADY DONE) — НЕ ТРОГАТЬ, только verify
- PATCH-1: materialize stable UID = bepaid_uid
- PATCH-3: purge tool dry-run/execute
- PATCH-4: subscription-charge uses updatedPayment.status
- PATCH-5: backfill 2026 flat fields

============================================================================
ПОРЯДОК ИСПОЛНЕНИЯ (STRICT)
1) PATCH-10 (security)
2) PATCH-6 (110 BYN)
3) PATCH-8 (timezone)
4) PATCH-7 (statement reconcile)
5) PATCH-2 (trial + integrity fix tool for current orphan/mismatches)
6) PATCH-9 (nightly invariants)

============================================================================
СПИСОК ФАЙЛОВ ДЛЯ ИЗМЕНЕНИЯ (сверка, ничего не теряем)
- src/App.tsx
- src/components/layout/ImpersonationBar.tsx
- src/components/admin/payments/Backfill2026OrdersTool.tsx
- src/components/admin/AdminChargeDialog.tsx
- src/components/admin/bepaid/BepaidImportDialog.tsx
- src/components/settings/ProfileSettings.tsx (или новый экран)
- src/components/admin/payments/PaymentsTabContent.tsx (или таблица платежей)
- supabase/functions/admin-backfill-2026-orders/index.ts
- supabase/functions/subscription-charge/index.ts
- supabase/functions/bepaid-webhook/index.ts
- supabase/functions/admin-materialize-queue-payments/index.ts
- NEW: supabase/functions/admin-materialize-statement-lines/index.ts
- NEW: supabase/functions/admin-fix-payments-integrity/index.ts
- NEW: src/components/admin/payments/FixPaymentsIntegrityTool.tsx
- NEW: supabase/functions/nightly-payments-invariants/index.ts
- SQL migrations:
  - profiles.timezone
  - unique index payments_v2(provider, provider_payment_id)
  - statement_lines table
  - trial_blocks table
  - (optional) tariff_prices deleted_at if needed for archival

============================================================================
DoD SQL (после выполнения)
1) duplicates = 0
SELECT COUNT(*) FROM (
  SELECT provider, provider_payment_id
  FROM payments_v2
  WHERE provider_payment_id IS NOT NULL
  GROUP BY provider, provider_payment_id
  HAVING COUNT(*) > 1
) d;

2) orphan 2026+ = 0
SELECT COUNT(*) FROM payments_v2
WHERE paid_at >= '2026-01-01'
  AND status='succeeded'
  AND amount>0
  AND profile_id IS NOT NULL
  AND order_id IS NULL;

3) mismatches = 0
SELECT COUNT(*) FROM payments_v2 p
JOIN orders_v2 o ON o.id = p.order_id
WHERE p.status='succeeded'
  AND p.amount>0
  AND o.status='paid'
  AND (o.final_price IS NULL OR o.final_price <> p.amount);

4) tariff_price 110 = 0 (или archived; тогда 0 active+visible)
SELECT COUNT(*) FROM tariff_prices WHERE price=110 OR final_price=110;

5) SYSTEM ACTOR proof
SELECT action, COUNT(*)
FROM audit_logs
WHERE actor_type='system' AND actor_user_id IS NULL
  AND action IN (
    'tariff_price.deleted',
    'tariff_price.archived',
    'payment.trial_blocked',
    'payment.mismatch_amount_guard_triggered',
    'payment.import_rejected_missing_uid',
    'nightly.payments_invariants_run',
    'auth.suspicious_state_detected',
    'subscription.multiple_active_prices_error'
  )
GROUP BY action;