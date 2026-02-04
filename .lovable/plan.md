
# План исправления ошибок и добавления функционала

## Выявленные проблемы

| # | Проблема | Причина | Решение |
|---|----------|---------|---------|
| 1 | Ошибка "Не удалось загрузить контакт" при клике | `linked_user_id` = ID подписки, а не profile.id | Исправить `openContactSheet` — искать профиль по `user_id` через JOIN |
| 2 | Кнопка "Открыть в bePaid" → 404 | URL `app.bepaid.by/en/subscriptions/...` не существует | Заменить на `admin.bepaid.by/subscriptions/...` |
| 3 | Подписки не сохраняются (загружаются заново) | `staleTime: 60000` — 1 минута, данные кешируются | Увеличить `staleTime` и добавить кеширование в БД |
| 4 | Нет привязки/отвязки сделок как в Платежах | Отсутствуют диалоги `LinkDealDialog`, `UnlinkDealDialog` | Добавить диалоги и логику привязки к orders_v2 |
| 5 | Нет колонки ID платежа | Отсутствует в данных | Добавить колонку `payment_id` из связи с payments_v2 |
| 6 | Нет колонки даты отмены | Отсутствует | Добавить `canceled_at` из bePaid или DB |
| 7 | Аварийная отвязка требует ввода "UNLINK" | Текущая логика | Упростить до подтверждающей кнопки "Да" |

---

## Технический план

### PATCH-T1: Исправление ошибки загрузки контакта

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

**Проблема:** `openContactSheet` использует `linked_user_id`, но это `user_id` (auth.users), а не `profile.id`. Supabase ищет `profiles.id = user_id` и не находит.

**Решение:** Искать профиль по `user_id` как в PaymentsTable:

```typescript
const openContactSheet = async (userId: string) => {
  try {
    // Ищем по user_id, а не по id
    const { data: contact, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error) throw error;
    if (!contact) {
      // Fallback: попробовать по id
      const { data: byId } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (byId) {
        setSelectedContact(byId);
        setContactSheetOpen(true);
        return;
      }
      throw new Error("Контакт не найден");
    }
    
    setSelectedContact(contact);
    setContactSheetOpen(true);
  } catch (e) {
    console.error("Failed to load contact:", e);
    toast.error("Не удалось загрузить контакт");
  }
};
```

---

### PATCH-T2: Исправление URL кнопки "Открыть в bePaid"

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

**Было (строка ~814):**
```typescript
onClick={() => window.open(`https://app.bepaid.by/en/subscriptions/${sub.id}`, '_blank')}
```

**Станет:**
```typescript
onClick={() => window.open(`https://admin.bepaid.by/subscriptions/${sub.id}`, '_blank')}
```

---

### PATCH-T3: Добавить функционал привязки контактов и сделок

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

**Добавить импорты:**
```typescript
import { LinkContactDialog } from "./LinkContactDialog";
import { UnlinkContactDialog } from "./UnlinkContactDialog";
import { LinkDealDialog } from "./LinkDealDialog";
import { UnlinkDealDialog } from "./UnlinkDealDialog";
```

**Добавить state:**
```typescript
// Dialogs for linking
const [linkContactOpen, setLinkContactOpen] = useState(false);
const [unlinkContactOpen, setUnlinkContactOpen] = useState(false);
const [linkDealOpen, setLinkDealOpen] = useState(false);
const [unlinkDealOpen, setUnlinkDealOpen] = useState(false);
const [selectedSubscription, setSelectedSubscription] = useState<BepaidSubscription | null>(null);
```

**Добавить действия в ячейку `actions`:**
```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <MoreHorizontal className="h-3 w-3" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => { setSelectedSubscription(sub); setLinkContactOpen(true); }}>
      <User className="h-3 w-3 mr-2" />
      {sub.linked_user_id ? "Перепривязать контакт" : "Привязать контакт"}
    </DropdownMenuItem>
    {sub.linked_user_id && (
      <DropdownMenuItem onClick={() => { setSelectedSubscription(sub); setUnlinkContactOpen(true); }}>
        <Unlink className="h-3 w-3 mr-2" />
        Отвязать контакт
      </DropdownMenuItem>
    )}
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => { setSelectedSubscription(sub); setLinkDealOpen(true); }}>
      <Handshake className="h-3 w-3 mr-2" />
      Привязать сделку
    </DropdownMenuItem>
    {/* ... другие действия */}
  </DropdownMenuContent>
</DropdownMenu>
```

---

### PATCH-T4: Добавить новые колонки

**Обновить DEFAULT_COLUMNS:**
```typescript
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "checkbox", label: "", visible: true, width: 40, order: 0 },
  { key: "id", label: "ID подписки", visible: true, width: 130, order: 1 },
  { key: "status", label: "Статус", visible: true, width: 100, order: 2 },
  { key: "customer", label: "Клиент", visible: true, width: 160, order: 3 },
  { key: "plan", label: "План", visible: true, width: 150, order: 4 },
  { key: "amount", label: "Сумма", visible: true, width: 90, order: 5 },
  { key: "next_billing", label: "Списание", visible: true, width: 110, order: 6 },
  { key: "card", label: "Карта", visible: true, width: 100, order: 7 },  // включить
  { key: "payment_id", label: "ID платежа", visible: false, width: 130, order: 8 }, // NEW
  { key: "deal", label: "Сделка", visible: true, width: 100, order: 9 }, // NEW
  { key: "created", label: "Создано", visible: false, width: 100, order: 10 },
  { key: "canceled_at", label: "Отменено", visible: false, width: 100, order: 11 }, // NEW
  { key: "connection", label: "Связь", visible: true, width: 100, order: 12 },
  { key: "actions", label: "", visible: true, width: 100, order: 13 },
];
```

**Обновить interface BepaidSubscription:**
```typescript
interface BepaidSubscription {
  // ... existing fields
  linked_order_id?: string | null;
  linked_order_number?: string | null;
  linked_payment_id?: string | null;
  canceled_at?: string | null;
}
```

**Обновить renderCell для новых колонок:**
```typescript
case 'payment_id':
  return sub.linked_payment_id ? (
    <button onClick={() => copyId(sub.linked_payment_id!)} className="...">
      {sub.linked_payment_id.slice(0, 8)}...
    </button>
  ) : <span className="text-muted-foreground text-xs">—</span>;

case 'deal':
  return sub.linked_order_id ? (
    <button onClick={() => openDealSheet(sub.linked_order_id!)} className="...">
      {sub.linked_order_number || 'Сделка'}
    </button>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => { setSelectedSubscription(sub); setLinkDealOpen(true); }}>
      <Plus className="h-3 w-3" />
    </Button>
  );

case 'canceled_at':
  return sub.canceled_at ? formatDate(sub.canceled_at) : <span className="text-muted-foreground text-xs">—</span>;
```

---

### PATCH-T5: Упростить аварийную отвязку

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

**Было (требует ввода "UNLINK"):**
```typescript
<p>Введите <strong>UNLINK</strong> для подтверждения:</p>
<Input value={emergencyUnlinkConfirm} ... />
<Button disabled={emergencyUnlinkConfirm !== "UNLINK"} ...>
```

**Станет (простое подтверждение):**
```typescript
<AlertDialogDescription asChild>
  <div className="space-y-3">
    {!canUnlink(...) && (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
        <p className="font-medium">⚠️ Подписка НЕ отменена в bePaid!</p>
        <p className="mt-1">Автосписания могут продолжаться.</p>
      </div>
    )}
    <p>Вы уверены, что хотите отвязать подписку от системы?</p>
  </div>
</AlertDialogDescription>
<AlertDialogFooter>
  <AlertDialogCancel>Отмена</AlertDialogCancel>
  <AlertDialogAction onClick={handleEmergencyUnlink} className="bg-destructive">
    Да, отвязать
  </AlertDialogAction>
</AlertDialogFooter>
```

**Убрать проверку UNLINK:**
```typescript
const handleEmergencyUnlink = async () => {
  if (!targetEmergencyUnlinkId) return;
  // ... остальная логика без проверки emergencyUnlinkConfirm
};
```

---

### PATCH-T6: Улучшить кеширование данных

**Файл:** `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx`

**Было:**
```typescript
staleTime: 60000, // 1 минута
```

**Станет:**
```typescript
staleTime: 5 * 60 * 1000, // 5 минут — данные реже устаревают
refetchOnWindowFocus: false, // не перезагружать при фокусе
```

---

### PATCH-T7: Обновить Edge Function для связей

**Файл:** `supabase/functions/bepaid-list-subscriptions/index.ts`

**Добавить запрос связей с orders/payments:**
```typescript
// Get linked orders and payments
const { data: linkedPayments } = await supabase
  .from('payments_v2')
  .select('id, order_id, meta, orders_v2(id, order_number)')
  .not('meta->bepaid_subscription_id', 'is', null);

const bepaidIdToPaymentOrder = new Map();
for (const p of linkedPayments || []) {
  const bepaidSubId = (p.meta as any)?.bepaid_subscription_id;
  if (bepaidSubId) {
    bepaidIdToPaymentOrder.set(String(bepaidSubId), {
      payment_id: p.id,
      order_id: p.order_id,
      order_number: p.orders_v2?.order_number,
    });
  }
}
```

**Добавить в результат:**
```typescript
linked_order_id: linkedPaymentOrder?.order_id || null,
linked_order_number: linkedPaymentOrder?.order_number || null,
linked_payment_id: linkedPaymentOrder?.payment_id || null,
```

---

## Файлы к изменению

| Файл | Патчи |
|------|-------|
| `src/components/admin/payments/BepaidSubscriptionsTabContent.tsx` | T1, T2, T3, T4, T5, T6 |
| `supabase/functions/bepaid-list-subscriptions/index.ts` | T7 |

---

## DoD (Definition of Done)

| # | Проверка | Ожидание |
|---|----------|----------|
| 1 | Клик на имя клиента | Открывается Sheet без ошибки |
| 2 | Кнопка "Открыть в bePaid" | Переходит на admin.bepaid.by |
| 3 | Колонка "Карта" | Показывает **** XXXX |
| 4 | Колонка "Сделка" | Кликабельна, открывает DealDetailSheet |
| 5 | Кнопка "Привязать контакт" | Открывает LinkContactDialog |
| 6 | Аварийная отвязка | Не требует ввода "UNLINK" |
| 7 | После обновления страницы | Данные не обнуляются на 5 минут |

---

## Приоритеты

1. **CRITICAL**: PATCH-T1 — исправить ошибку загрузки контакта
2. **CRITICAL**: PATCH-T2 — исправить URL bePaid
3. **HIGH**: PATCH-T5 — упростить аварийную отвязку
4. **HIGH**: PATCH-T6 — улучшить кеширование
5. **MEDIUM**: PATCH-T3 — добавить диалоги привязки
6. **MEDIUM**: PATCH-T4, T7 — новые колонки
