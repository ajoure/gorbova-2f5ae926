
# Исправление: непонятные подписки с английскими лейблами

## Две проблемы

### Проблема 1: Английские лейблы статусов

В функции `getSubscriptionStatusBadge` (ContactDetailSheet.tsx, строка 1299-1316) обрабатываются только 4 случая: expired, canceled, trial, active. Для всех остальных статусов (`past_due`, `superseded`, `pending`) отображается сырое английское значение из базы.

**Решение**: Добавить маппинг всех статусов на русский язык.

| Статус       | Текущее отображение | Будет             |
|-------------|--------------------|--------------------|
| past_due    | past_due           | Просрочена         |
| superseded  | superseded         | Заменена           |
| pending     | pending            | Ожидает оплаты     |
| paused      | paused             | Приостановлена     |
| expired     | expired            | Истекла (уже есть) |

### Проблема 2: Дублирование подписок при создании ссылки на оплату

Функция `admin-create-payment-link` при типе `subscription` создаёт запись в `subscriptions_v2` со статусом `past_due` **сразу** (до оплаты). Затем, когда клиент оплачивает, `bepaid-webhook` вызывает `grant-access-for-order`, который создаёт **ещё одну** подписку. Итого у клиента появляются лишние записи `past_due`.

Видно в базе: у Александры Сермяжко есть 2 записи `past_due` с `created_by_admin`, созданные при генерации ссылок, и 1 нормальная `active` подписка после оплаты.

**Решение**: Не создавать `subscriptions_v2` в `admin-create-payment-link`. Подписка должна создаваться только после оплаты через `grant-access-for-order`. Достаточно создать `orders_v2` и `provider_subscriptions`.

---

## Технические детали

### Файл 1: `src/components/admin/ContactDetailSheet.tsx`

Функция `getSubscriptionStatusBadge` (строки 1299-1316):
- Добавить обработку статусов `past_due`, `superseded`, `pending`, `paused`, `expired_reentry`
- Каждый статус получает русский лейбл и соответствующий цвет

### Файл 2: `supabase/functions/admin-create-payment-link/index.ts`

Блок subscription (строки 276-298):
- Убрать создание записи `subscriptions_v2` до оплаты
- Изменить `tracking_id` формат: вместо `subv2:{sub_id}:order:{order_id}` использовать `link:order:{order_id}` (без sub_id, т.к. подписки ещё нет)
- Сохранить product_id и tariff_id в meta заказа, чтобы `grant-access-for-order` мог их использовать
- Убрать из ответа `subscription_id`

### Без изменений
- `grant-access-for-order` -- уже корректно создаёт подписку по order
- `bepaid-webhook` -- не затрагивается
- RLS-политики -- не затрагиваются
