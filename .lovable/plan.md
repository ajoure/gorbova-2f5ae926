
# PATCH-LINK: link:order: subscription webhook handler (DEPLOYED)

## Что сделано

### A) Новый handler PATCH-LINK (add-only, после PATCH-1)

Условие входа: `isSubscriptionWebhook && parsedOrderId && rawTrackingId?.startsWith('link:order:')`

Логика:
1. **Idempotency** — `payments_v2` по `provider_payment_id = transactionUid`
2. **Проверка успешности** — только `active`/`successful` обрабатываются
3. **Поиск заказа** — `orders_v2` по `parsedOrderId`, при отсутствии → orphan + audit
4. **Обновление заказа** → `status='paid'`, `paid_amount`, `meta.bepaid_subscription_id`
5. **Создание `payments_v2`** — succeeded, provider=bepaid, is_recurring=true
6. **Обновление `provider_subscriptions`** → state=active, card data
7. **Вызов `grant-access-for-order`** → subscriptions_v2 + entitlements + TG доступ
8. **Admin notification** в Telegram
9. **Audit log** — `bepaid.webhook.link_order_processed`

### B) Исправлена main branch: поиск payment

Было: `payments_v2.eq('id', orderId)` — только прямой поиск по payment UUID.

Стало: двухэтапный поиск:
1. `payments_v2.eq('id', orderId)` — для direct-charge (tracking_id = payment UUID)
2. Fallback: `payments_v2.eq('order_id', orderId)` — для link: формата (tracking_id = order UUID)

## Backfill

Для зависших заказов (Елена Крац, Елена Гудвилович) варианты:
- **Вариант 1**: Повторный webhook от bePaid — новый handler обработает автоматически
- **Вариант 2**: Ручной вызов `grant-access-for-order` + создание payments_v2

## Деплой

- ✅ `bepaid-webhook` задеплоен
