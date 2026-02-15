
# Исправление ошибки списания + Генерация ссылки на оплату для клиента

## 1. Корневая причина ошибки "bePaid error: 500"

В логах edge-функции `admin-manual-charge` видно:
```
bePaid response: {"response":{"message":"We're sorry, but something went wrong"}}
```

**Причина**: Двойной префикс `Basic` в заголовке авторизации.

- Строка 84: `const bepaidAuth = createBepaidAuthHeader(bepaidCreds);` — возвращает `"Basic base64(shop:key)"`
- Строка 147: `'Authorization': \`Basic ${bepaidAuth}\`` — подставляет ещё один `Basic`
- Итого отправляется: `"Basic Basic c2hvcF9pZDpzZWNyZXQ="` — bePaid отвечает 500

**Исправление**: Убрать лишний `Basic` на строке 147, использовать `bepaidAuth` напрямую.

---

## 2. Новая функция: Ссылка на самостоятельную оплату клиентом

### Что будет создано

**Новая edge-функция**: `admin-create-payment-link`
- Админ указывает: user_id, product_id, tariff_id, сумму, тип оплаты (разовая или подписка)
- Функция создаёт bePaid checkout (для разовой) или subscription (для подписки)
- Возвращает `redirect_url` — ссылку, которую можно скопировать и отправить клиенту
- Для разовой оплаты: создаёт `orders_v2` (pending) + bePaid checkout
- Для подписки: использует существующую логику `bepaid-create-subscription-checkout`

**Новый UI-компонент**: `AdminPaymentLinkDialog`
- Диалог с выбором: продукт, тариф, сумма (предзаполняется из тарифа), тип оплаты (разовая / подписка bePaid)
- Кнопка "Создать ссылку" генерирует URL
- Готовая ссылка отображается с кнопкой "Копировать"
- Подключается к карточке контакта (рядом с кнопкой "Списать деньги")

---

## План изменений

### Шаг 1: Исправить двойной Basic в `admin-manual-charge`

**Файл**: `supabase/functions/admin-manual-charge/index.ts`
- Строка 147: заменить `'Authorization': \`Basic ${bepaidAuth}\`` на `'Authorization': bepaidAuth`

### Шаг 2: Создать edge-функцию `admin-create-payment-link`

**Файл**: `supabase/functions/admin-create-payment-link/index.ts`

Функция принимает:
```
{
  user_id: string,
  product_id: string,
  tariff_id: string,
  amount: number (в копейках),
  payment_type: "one_time" | "subscription",
  description?: string
}
```

Логика для `one_time`:
- Создать `orders_v2` (pending)
- Создать bePaid checkout через `https://checkout.bepaid.by/ctp/api/checkouts`
- Вернуть `redirect_url`

Логика для `subscription`:
- Переиспользовать логику из `bepaid-create-subscription-checkout`
- Создать bePaid subscription через `https://api.bepaid.by/subscriptions`
- Вернуть `redirect_url`

### Шаг 3: Создать UI-диалог `AdminPaymentLinkDialog`

**Файл**: `src/components/admin/AdminPaymentLinkDialog.tsx`

Интерфейс:
- Селект продукта и тарифа (как в AdminChargeDialog)
- Поле суммы (предзаполняется из тарифа, редактируемое)
- Выбор типа оплаты: "Разовая оплата" / "Подписка bePaid"
- Кнопка "Создать ссылку"
- После создания: поле с URL + кнопка "Копировать ссылку"

### Шаг 4: Подключить диалог к контакту

**Файл**: `src/components/admin/ContactDetailSheet.tsx`

- Добавить кнопку "Ссылка на оплату" рядом с "Списать деньги" в разделе привязанных карт
- Открывает `AdminPaymentLinkDialog` с передачей `userId`, `userName`, `userEmail`

---

## Технические детали

### Изменяемые файлы
1. `supabase/functions/admin-manual-charge/index.ts` — fix двойного Basic (1 строка)
2. `supabase/functions/admin-create-payment-link/index.ts` — **новый** (edge-функция)
3. `src/components/admin/AdminPaymentLinkDialog.tsx` — **новый** (UI-диалог)
4. `src/components/admin/ContactDetailSheet.tsx` — добавление кнопки

### Без изменений
- `bepaid-create-subscription-checkout` — не затрагивается
- `bepaid-webhook` — не затрагивается (обрабатывает оплату после перехода клиента по ссылке)
- RLS-политики — не затрагиваются
- Логика grant-access — не затрагивается (срабатывает через webhook)
