
# План: Привязка контакта и сделки для Подписок bePaid

## Выявленная проблема

Ошибка `invalid input syntax for type uuid: "sbs_4f94d889190cd704"` возникает потому что:
- `LinkDealDialog` и `LinkContactDialog` предназначены для работы с `payments_v2` / `payment_reconcile_queue`
- Они ожидают `paymentId` как валидный UUID
- Но для подписок передаётся `selectedSubscription.id` = `sbs_*`, который **не является UUID**

Код проблемы (строка 1595):
```typescript
paymentId={selectedSubscription.linked_payment_id || selectedSubscription.id}
```
Когда `linked_payment_id = null`, используется `sub.id` = `sbs_*` → ошибка.

---

## Решение

Создать **два специализированных диалога** для работы с подписками:

1. `LinkSubscriptionContactDialog` — привязка контакта к подписке
2. `LinkSubscriptionDealDialog` — привязка сделки к подписке

Они будут обновлять таблицу `provider_subscriptions` напрямую по `provider_subscription_id`.

---

## Технический план

### PATCH-1: Создать `LinkSubscriptionContactDialog`

**Файл:** `src/components/admin/payments/LinkSubscriptionContactDialog.tsx`

Логика:
1. Поиск контактов через edge-функцию `admin-search-profiles`
2. При выборе контакта:
   - Обновить `provider_subscriptions.profile_id` по `provider_subscription_id`
   - Обновить `provider_subscriptions.user_id` (из `profiles.user_id`)
   - Если есть карта — создать связь в `card_profile_links`

Props интерфейс:
```typescript
interface LinkSubscriptionContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string; // bePaid subscription ID (sbs_*)
  customerEmail?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  onSuccess: () => void;
}
```

---

### PATCH-2: Создать `LinkSubscriptionDealDialog`

**Файл:** `src/components/admin/payments/LinkSubscriptionDealDialog.tsx`

Логика:
1. Поиск сделок (`orders_v2`) по номеру или сумме
2. При выборе сделки:
   - Обновить `orders_v2.meta` — добавить `bepaid_subscription_id`
   - Обновить `provider_subscriptions.profile_id` из `orders_v2.profile_id`
   - Обновить `provider_subscriptions.user_id` из `orders_v2.user_id`

Props интерфейс:
```typescript
interface LinkSubscriptionDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string; // bePaid subscription ID (sbs_*)
  amount?: number;
  currency?: string;
  profileId?: string | null;
  onSuccess: () => void;
}
```

---

### PATCH-3: Создать `UnlinkSubscriptionContactDialog`

**Файл:** `src/components/admin/payments/UnlinkSubscriptionContactDialog.tsx`

Логика:
- Обнулить `provider_subscriptions.profile_id` и `user_id` по `provider_subscription_id`

---

### PATCH-4: Создать `UnlinkSubscriptionDealDialog`

**Файл:** `src/components/admin/payments/UnlinkSubscriptionDealDialog.tsx`

Логика:
- Удалить `bepaid_subscription_id` из `orders_v2.meta`

---

### PATCH-5: Обновить `BepaidSubscriptionsTabContent.tsx`

1. Заменить импорты диалогов:
```typescript
// Было
import { LinkContactDialog } from "./LinkContactDialog";
import { UnlinkContactDialog } from "./UnlinkContactDialog";
import { LinkDealDialog } from "./LinkDealDialog";
import { UnlinkDealDialog } from "./UnlinkDealDialog";

// Станет
import { LinkSubscriptionContactDialog } from "./LinkSubscriptionContactDialog";
import { UnlinkSubscriptionContactDialog } from "./UnlinkSubscriptionContactDialog";
import { LinkSubscriptionDealDialog } from "./LinkSubscriptionDealDialog";
import { UnlinkSubscriptionDealDialog } from "./UnlinkSubscriptionDealDialog";
```

2. Обновить вызовы диалогов (строки 1554-1622):
```typescript
{selectedSubscription && (
  <LinkSubscriptionContactDialog
    open={linkContactOpen}
    onOpenChange={setLinkContactOpen}
    subscriptionId={selectedSubscription.id}
    customerEmail={selectedSubscription.customer_email}
    cardLast4={selectedSubscription.card_last4}
    cardBrand={selectedSubscription.card_brand}
    onSuccess={() => {
      setLinkContactOpen(false);
      setSelectedSubscription(null);
      queryClient.invalidateQueries({ queryKey: ["bepaid-subscriptions-admin"] });
    }}
  />
)}

{selectedSubscription && (
  <LinkSubscriptionDealDialog
    open={linkDealOpen}
    onOpenChange={setLinkDealOpen}
    subscriptionId={selectedSubscription.id}
    amount={selectedSubscription.plan_amount}
    currency={selectedSubscription.plan_currency}
    profileId={selectedSubscription.linked_user_id}
    onSuccess={() => {
      setLinkDealOpen(false);
      setSelectedSubscription(null);
      queryClient.invalidateQueries({ queryKey: ["bepaid-subscriptions-admin"] });
    }}
  />
)}
```

---

## Схема обновления данных

```text
Привязка контакта:
┌──────────────────────────────────────────────────────────┐
│ 1. admin-search-profiles → выбор profiles.id            │
│ 2. UPDATE provider_subscriptions                        │
│    SET profile_id = ?, user_id = profiles.user_id       │
│    WHERE provider_subscription_id = 'sbs_*'             │
│ 3. INSERT card_profile_links (если есть card_last4)     │
└──────────────────────────────────────────────────────────┘

Привязка сделки:
┌──────────────────────────────────────────────────────────┐
│ 1. Поиск orders_v2 по order_number / сумме              │
│ 2. UPDATE orders_v2                                     │
│    SET meta = meta || {"bepaid_subscription_id": "sbs_*"}│
│    WHERE id = selected_order_id                          │
│ 3. UPDATE provider_subscriptions                        │
│    SET profile_id = orders_v2.profile_id,               │
│        user_id = orders_v2.user_id                      │
│    WHERE provider_subscription_id = 'sbs_*'             │
└──────────────────────────────────────────────────────────┘
```

---

## Файлы к созданию/изменению

| Файл | Действие |
|------|----------|
| `src/components/admin/payments/LinkSubscriptionContactDialog.tsx` | Создать |
| `src/components/admin/payments/UnlinkSubscriptionContactDialog.tsx` | Создать |
| `src/components/admin/payments/LinkSubscriptionDealDialog.tsx` | Создать |
| `src/components/admin/payments/UnlinkSubscriptionDealDialog.tsx` | Создать |
| `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx` | Изменить импорты и вызовы |

---

## DoD (Definition of Done)

| # | Проверка | Ожидание |
|---|----------|----------|
| 1 | Клик "Привязать контакт" | Открывается диалог поиска, без ошибок |
| 2 | Выбор контакта + "Связать" | `provider_subscriptions.profile_id` обновляется |
| 3 | Клик "Привязать сделку" | Открывается диалог поиска сделок, без ошибок UUID |
| 4 | Выбор сделки + "Связать" | `orders_v2.meta.bepaid_subscription_id` обновляется |
| 5 | Отвязка контакта | `provider_subscriptions.profile_id` = NULL |
| 6 | Отвязка сделки | `bepaid_subscription_id` удаляется из `orders_v2.meta` |

---

## Почему нельзя переиспользовать существующие диалоги

1. `LinkContactDialog` и `LinkDealDialog` работают с `payments_v2.id` (UUID)
2. Они используют `rawSource: 'queue' | 'payments_v2'`
3. Для подписок нужно обновлять `provider_subscriptions` по текстовому `provider_subscription_id`
4. Логика привязки сделки отличается: нужно обновить `orders_v2.meta`, а не `payments_v2.order_id`

Создание отдельных диалогов — чистое решение без риска сломать существующую логику платежей.
