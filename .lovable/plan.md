ЖЁСТКИЕ ПРАВИЛА ИСПОЛНЕНИЯ ДЛЯ LOVABLE.DEV
- Ничего не ломать и не трогать лишнее. Add-only где возможно. Минимальный diff.
- Dry-run → execute. Везде STOP-guards/лимиты/идемпотентность.
- bePaid: НИКАКИХ env fallback. shop_id/keys/secret только из integration_instances через единый strict helper.
- Webhook быстрый и идемпотентный: никаких внешних bePaid charge/refund внутри webhook.
- Никаких “сделано” без DoD-фактов: UI-скрин (из 7500084@gmail.com) + audit_logs + SQL-пруфы + grep.
- Без PII/карточных деталей в логах (не логировать shop_id, токены, полные emails).

PATCH: Безопасная верификация карты (1 BYN) + Ledger для токенизаций/проверок

Цели:
1) Убрать синхронные charge/refund из payment-methods-webhook (время ответа <500ms).
2) Перенести verify-charge=1 BYN + refund=1 BYN в worker payment-method-verify-recurring.
3) Любая инициированная нами verify/tokenization транзакция должна автоматически отражаться в payments_v2 и в /admin/payments (без ручного импорта “Выписка bePaid”).
4) Убрать ENV fallback минимум из P0/P1 функций (и стремиться к 0 по всем 17).
5) Добавить UI polling статуса verification_status после привязки.

========================
A) CRITICAL — payment-methods-webhook: удалить синхронную верификацию
========================
Файл: supabase/functions/payment-methods-webhook/index.ts

1) Полностью удалить блок “SYNCHRONOUS CARD VERIFICATION” (строки ~485-618).
2) Оставить в webhook ТОЛЬКО:
   - upsert payment_method
   - payment_methods.verification_status='pending' (и recurring_verified=false по умолчанию)
   - создать запись в payment_method_verification_jobs с идемпотентным ключом
   - audit_logs (SYSTEM): action='card.verification.queued'
   - return 200 (<500ms)
3) В webhook использовать getBepaidCredsStrict() только для валидации “bePaid настроен/не настроен”.
   Никаких bePaid API вызовов (charge/refund) внутри webhook.

Idempotency key (обязательный формат):
- idempotency_key = pm_verify:<payment_method_id>:<token_hash_16>
- token_hash_16 = первые 16 hex символов sha256(provider_token)
Пример:
pm_verify:abc123...:a1b2c3d4e5f67890

========================
B) CRITICAL — payment-method-verify-recurring: verify + refund + ledger
========================
Файл: supabase/functions/payment-method-verify-recurring/index.ts

1) Verify-charge:
- amount=100 (1 BYN в копейках), currency=BYN
- description="Проверка карты для автоплатежей (будет возвращено)"
- УДАЛИТЬ skip_three_d_secure_verification (не используем).
- 3DS required → verification_status='rejected_3ds_required'

2) Ledger (payments_v2) — ОБЯЗАТЕЛЬНО:
2.1) Перед charge создать payments_v2 запись:
- payment_classification='card_verification'
- origin='card_verification'
- transaction_type='tokenization' (или 'verification' — выбрать 1 и использовать везде последовательно)
- status='processing'
- amount=1.00 BYN
- связь: user_id, profile_id (из profiles по user_id), payment_method_id в meta
- сохранить verify_tracking_id

2.2) После charge обновить payments_v2:
- status='succeeded'/'failed'
- provider_payment_id = txUid
- paid_at
- error_message (без PII)

2.3) Refund:
- создать отдельную запись payments_v2 для refund:
  transaction_type='refund'
  reference_payment_id = verify_payment_id
  provider_payment_id = refundUid
  status='refunded' если успешен, иначе 'processing' (и needs_review)

3) payment_methods.meta (обязательные поля):
- verify_charge_uid
- verify_refund_uid
- verify_tracking_id
- verify_payment_id (payments_v2.id)

4) Статусы payment_methods:
- verified (charge ok + refund ok)
- verified_refund_pending (charge ok, refund не подтвержден) + needs_review audit_logs
- rejected_3ds_required (3DS required)
- failed (прочие ошибки, с нормализованным verification_error)

5) audit_logs (SYSTEM ACTOR) — обязательно:
- card.verification.started
- card.verification.completed (status=verified/failed/rejected_3ds_required/verified_refund_pending)
- card.verification.stop_guard (если идемпотентность сработала)

========================
C) CRITICAL/HIGH — Идемпотентность worker (без дублей списаний)
========================
Таблица: payment_method_verification_jobs

1) unique(idempotency_key) обязателен.
2) STOP-guard:
- если уже есть job по этому ключу со статусом running/succeeded
  ИЛИ payment_methods.verification_status IN ('verified','rejected_3ds_required','verified_refund_pending')
  → не делать повторный charge, логировать STOP и завершать.
3) max_attempts=3 + backoff.

========================
D) HIGH — Убрать ENV fallback (минимум P0/P1)
========================
Требование: grep по репо в P0/P1 функциях должен дать 0 на Deno.env.get('BEPAID_').

Обязательные P0:
- bepaid-webhook/index.ts
- payment-methods-tokenize/index.ts
- payment-methods-webhook/index.ts
- payment-method-verify-recurring/index.ts
- subscription-charge/index.ts
- direct-charge/index.ts
- admin-manual-charge/index.ts
- bepaid-create-token/index.ts

P1 (как минимум):
- installment-charge-cron/index.ts
- bepaid-create-subscription*.ts (все)

Везде использовать:
getBepaidCredsStrict + createBepaidAuthHeader, без ручных select и без env fallback.

========================
E) MEDIUM — UI polling статуса verification_status
========================
Файл: src/pages/settings/PaymentMethods.tsx

1) После возврата tokenize=success:
- начать polling newest payment_method.verification_status каждые 2 сек до 30 сек
- при выходе из pending → invalidateQueries(['user-payment-methods'])
2) Badge:
- pending → “Проверяем карту…” + spinner
- rejected_3ds_required → понятный текст “Карта не подходит для автосписаний (3DS каждый раз)”
- verified_refund_pending → “Карта подтверждена, возврат в обработке” (для поддержки)

========================
F) MEDIUM — Отображение токенизаций/проверок в /admin/payments
========================
Файл: PaymentsTable/PaymentsTab

1) Показать все записи payments_v2 где payment_classification='card_verification'.
2) Специальный бейдж “Проверка карты” и корректное описание “Проверка карты (1 BYN)”, а не продукт.
3) Проверочные платежи и возвраты должны появляться автоматически сразу после запуска worker (processing → succeeded/refunded).

========================
DoD (факты)
========================
1) Webhook:
- не делает charge/refund (код отсутствует)
- <500ms (network waterfall/лог)
- audit_logs: card.verification.queued (SYSTEM)

2) Worker:
- делает charge=1 BYN и refund=1 BYN
- пишет payment_methods.verification_status итоговый
- сохраняет verify_charge_uid/refund_uid/tracking_id/payment_id

3) Ledger:
- в payments_v2 есть запись processing → succeeded/failed по verify
- есть refund запись, связанная с verify_payment_id
- в /admin/payments это видно без “Выписка bePaid → импорт”

4) Idempotency:
- повторный запуск не создаёт второй charge (SQL proof по tracking_id/uid + STOP audit_logs)

5) Grep:
- 0 совпадений Deno.env.get('BEPAID_') в P0/P1 функциях

6) UI:
- после привязки карты статус меняется без F5 (polling пруф скрином)

Доп. проблема из бизнеса (обязательное исправление):
- “Быстрая проверка снова висит” — после внедрения worker+polling проверить end-to-end: привязка карты → queued → worker → verified/rejected → UI обновился.