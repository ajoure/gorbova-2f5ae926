Жёсткие правила исполнения для Lovable.dev
1) Ничего не ломать и не трогать лишнее. Только add-only изменения и точечные правки.
2) Любая массовая операция: сначала dry-run (preview), затем execute. Нужны явные STOP-предохранители (лимиты/батчи/таймауты).
3) Никаких хардкодов сумм (1/100/250 и т.п.) в бизнес-логике и инвариантах. Классификация платежей — только по метаданным/типам/связям, а не по amount.
4) Timezone для nightly — фиксированный Europe/London (без привязки к Warsaw). Запуск должен происходить 1 раз в сутки в 03:00 Europe/London.
5) Все проверки делать set-based (SQL/RPC), без N+1 запросов по пользователям (иначе будет падать по лимитам).
6) Секреты/токены: не использовать *encrypted* поля как готовые токены. Только env secrets. Никаких паролей в чате.
7) Финальный отчёт обязателен: список изменённых файлов + diff-summary + результаты dry-run/execute + пруфы из админ-учётки 1@ajoure.by (скрины/логи/audit_logs).
8) SYSTEM ACTOR Proof обязателен: после nightly-run должна появиться реальная запись в audit_logs с actor_type='system', actor_user_id=NULL, actor_label заполнен.

PATCH-лист: Эталон системы + Ночной мониторинг инвариантов (Europe/London)

PATCH 1 (CRITICAL) — Amount source of truth для renewals (fix корневого бага)
- File: supabase/functions/subscription-charge/index.ts
- Change: после успешного charge обязательно синхронизировать amount из provider_response:
  amount = chargeResult.transaction.amount / 100
- Add: meta tracking при INSERT payments_v2:
  meta.amount_source, meta.calculated_amount, meta.recurring_amount, meta.is_renewal=true
- DoD: для всех succeeded renewals payments_v2.amount == provider_response.transaction.amount/100

PATCH 2 (CRITICAL) — Обязательная классификация платежей (без привязки к суммам)
- DB Migration: payments_v2
  ADD COLUMN payment_classification text
  enum: card_verification | trial_purchase | regular_purchase | subscription_renewal | refund | orphan_technical
- New shared: supabase/functions/_shared/paymentClassification.ts
  classifyPayment() — строго по: transaction_type/status/order_id/is_trial/is_recurring/order_number/description
  (amount НЕ использовать)
- Integrate: вызывать классификацию в:
  a) supabase/functions/bepaid-webhook/index.ts (create/update payment)
  b) supabase/functions/subscription-charge/index.ts (update payment)
- DoD: 100% новых payments_v2 имеют payment_classification != NULL

PATCH 3 (CRITICAL) — Централизация hasValidAccess() (единый источник истины)
- New shared: supabase/functions/_shared/accessValidation.ts
  hasValidAccess(supabase, userId) => {valid, source, endAt, ids...}
- Refactor to import shared:
  subscriptions-reconcile/index.ts
  telegram-revoke-access/index.ts
  telegram-check-expired/index.ts
- DoD: поиск по репо “hasValidAccess(” показывает только import из _shared

PATCH 4 (HIGH) — Nightly System Health Core (Europe/London + защита cron)
- New: supabase/functions/nightly-system-health/index.ts
  a) Validate header x-cron-secret == env CRON_SECRET (иначе 401)
  b) Один запуск в сутки: cron вызывает hourly, но внутри guard:
     if source='cron-hourly' and hour(Europe/London)!=3 => skipped
  c) Создать run в system_health_runs, записать checks в system_health_checks
  d) В конце — audit_logs запись (SYSTEM ACTOR proof)
- DoD: nightly-run реально выполняется 1 раз/сутки в 03:00 Europe/London

PATCH 5 (HIGH) — Таблицы мониторинга + RLS
- DB Migration:
  create table system_health_runs
  create table system_health_checks
  indexes
  RLS enabled
  policies: service_role full access
- DoD: таблицы существуют, пишутся из service_role, читаются в админке (read-only)

PATCH 6 (HIGH) — Инварианты payments (без чисел, без N+1)
- File: supabase/functions/nightly-payments-invariants/index.ts
- Add invariants (set-based):
  INV-P1 Amount synced with provider_response (mismatches=0)
  INV-P2 Classification coverage (unclassified=0)
  INV-P3 card_verification must NOT have order_id
  INV-P4 orphan_technical must NOT create order/deal side effects (проверка связей)
- DoD: ни один invariant не использует “amount == 1/100/…” как критерий

PATCH 7 (HIGH) — Инварианты access
- Add invariants (set-based):
  INV-A1 Active entitlements must have expires_at IS NULL OR > now
  INV-A2 Active subscriptions (active/trial/past_due) must have access_end_at > now
- DoD: нарушения => FAIL + алерт

PATCH 8 (HIGH) — Telegram wrongly revoked detector (строго set-based, без циклов)
- Replace текущий N+1 вариант.
- Сделать SQL/RPC (рекомендовано):
  rpc_find_wrongly_revoked() возвращает members где:
    access_status IN ('removed','expired','kicked','no_access')
    AND hasValidAccess(user_id)=true
- Nightly invariant:
  INV-T1 wrongly_revoked_count == 0
- DoD: 1 запрос → список с samples, без циклов по пользователям

PATCH 9 (MEDIUM) — Telegram alert владельцу (правильный источник токена)
- Secrets:
  OWNER_TELEGRAM_CHAT_ID=66086524
  PRIMARY_TELEGRAM_BOT_TOKEN=... (env secret)
- В nightly-system-health отправка через env token.
  НЕ использовать telegram_bots.bot_token_encrypted как готовый токен.
- DoD: при FAIL приходит plain-text сообщение владельцу

PATCH 10 (MEDIUM) — Trial flow invariant (триал обязан работать)
- Invariant (set-based) за 7 дней:
  paid trial order => должен существовать access (subscription OR entitlement) с валидным сроком
- Важно: триал — это нормальная покупка, она создаёт access и может привести к последующему списанию.
  Проверка должна ловить именно “после триала не создан доступ” и “конверсия сломала суммы/связи”.
- DoD: triаl сценарий проходит end-to-end без ручных фиксов

PATCH 11 (LOW) — UI /admin/system-health (read-only)
- New page: src/pages/admin/SystemHealth.tsx
  list runs (last 30)
  drilldown checks
  filter status
- DoD: админ видит историю и samples

PATCH 12 (MANDATORY) — SYSTEM ACTOR Proof (не обсуждается)
- После каждого nightly-run должна быть запись в audit_logs:
  actor_type='system', actor_user_id=NULL, actor_label='nightly-system-health'
- DoD: приложить пруф (скрин/лог из 1@ajoure.by), что запись реально появляется

CRON (Supabase SQL Editor, NOT migration)
- Hourly trigger + guard по Europe/London:

SELECT cron.schedule(
  'nightly-system-health-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/nightly-system-health',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', 'CRON_SECRET_VALUE'
    ),
    body := jsonb_build_object(
      'source','cron-hourly',
      'target_tz','Europe/London',
      'target_hour',3,
      'notify_owner', true
    )
  );
  $$
);

Финальный DoD спринта
1) Nightly выполняется 1 раз/сутки в 03:00 Europe/London и пишет system_health_* + audit_logs(system).
2) Нет хардкода сумм в проверках/логике классификации.
3) Trial + renewal + card verification работают параллельно и не ломают суммы/сделки.
4) Telegram revoke никогда не кикает пользователя при hasValidAccess()==true.
5) Все критичные FAIL ловятся ночью и прилетают владельцу в Telegram.
6) Пруфы: скрины/логи из 1@ajoure.by + diff-summary + список файлов.