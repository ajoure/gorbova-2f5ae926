# FINAL PATCH: bePaid Provider-Managed Subscriptions — last mile

## Жёсткие правила
- Ничего не ломать; минимальный diff (add-only где возможно)
- No-PII в логах (включая console.error/console.log)
- DoD только по фактам: SQL + HTTP + UI-скрины из 7500084@gmail.com
- STOP: если видите риск записи в рабочие таблицы при invalid signature — остановиться

---

## PATCH-1 (tiny): PII-safe console.error
Файл: PaymentMethods.tsx (строка ~69)

Было:
console.error('Failed to cancel old provider subscription:', err);

Нужно:
console.error('Failed to cancel old provider subscription', {
  message: err?.message,
  name: err?.name,
});

---

## DoD тестирование (обязательное)

### 1) Invalid signature webhook → 401 + orphan only
Отправить тестовый webhook с невалидной подписью.

Ожидаем:
- HTTP 401
- INSERT только в provider_webhook_orphans (reason IN ('invalid_signature','no_signature_header'))
- НЕТ записей в payments_v2/orders_v2 по provider_payment_id=<test_uid>

SQL:
SELECT id, reason, provider_payment_id, created_at
FROM provider_webhook_orphans
WHERE reason IN ('invalid_signature', 'no_signature_header')
ORDER BY created_at DESC
LIMIT 5;

SELECT * FROM payments_v2 WHERE provider='bepaid' AND provider_payment_id = '<test_uid>';
SELECT * FROM orders_v2   WHERE provider='bepaid' AND provider_payment_id = '<test_uid>';

### 2) Idempotency proof
SELECT provider, provider_payment_id, count(*)
FROM payments_v2
WHERE provider='bepaid' AND provider_payment_id IS NOT NULL
GROUP BY 1,2
HAVING count(*)>1;

SELECT provider, provider_payment_id, count(*)
FROM orders_v2
WHERE provider='bepaid' AND provider_payment_id IS NOT NULL
GROUP BY 1,2
HAVING count(*)>1;

Ожидаем: 0 строк в обоих запросах.

### 3) SYSTEM ACTOR Proof
SELECT action, actor_type, actor_user_id, actor_label, created_at
FROM audit_logs
WHERE action IN (
  'bepaid.subscription.create',
  'bepaid.subscription.webhook.renewal',
  'bepaid.subscription.cancel'
)
ORDER BY created_at DESC
LIMIT 20;

Ожидаем:
- actor_type='system'
- actor_user_id IS NULL
- actor_label заполнен

### 4) UI DoD (скриншоты)
После создания тестовой provider subscription под 7500084@gmail.com:
- User: /settings/payment-methods — видна секция “Подписки с автопродлением”
- Admin: Contact Card — видна секция “Подписки bePaid”
- Admin: AutoRenewals — видна колонка “Биллинг”

В финальном отчёте приложить скрины + результаты SQL + факт HTTP 401.