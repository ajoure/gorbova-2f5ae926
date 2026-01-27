
# План исправления UI платежей и расчёта комиссии

## Выявленные проблемы

### 1. Ошибка Edge Function "Failed to send a request"
**Причина:** В логах видно `Http: connection closed before message completed`. Это означает, что клиент закрыл соединение до получения ответа (timeout или закрытие модального окна), но синхронизация на сервере **завершилась успешно** (`21 create, 661 update, 0 delete`).

**Решение:** Добавить обработку ошибки соединения на клиенте — если получена ошибка "Failed to send", проверить логи/результаты и показать уведомление "Синхронизация могла завершиться — проверьте данные".

---

### 2. Колонка "Контакт" — убрать текст "Не связан"
**Текущее:** `<Badge>Не связан</Badge> + <Button с UserPlus иконкой>Привязать</Button>`
**Требуется:** Только иконка UserPlus без текста "Не связан" и "Привязать"

**Файл:** `src/components/admin/payments/PaymentsTable.tsx` (строки 511-522)
```tsx
// Было:
return (
  <div className="flex items-center gap-1">
    <Badge variant="outline" className="text-xs text-muted-foreground">Не связан</Badge>
    <ContactLinkActions ... />
  </div>
);

// Станет:
return (
  <ContactLinkActions ... />  // Только кнопка привязки без badge
);
```

**Также в `ContactLinkActions.tsx`** (строка 243):
```tsx
// Было:
{currentProfileId ? "Пересвязать" : "Привязать"}

// Станет: убрать текст, оставить только иконку
```

---

### 3. Колонка "Сделка" — убрать текст "Не связана"
**Текущее:** `<Badge>Не связана</Badge> + <Button с Link2 иконкой>`
**Требуется:** Только иконка Link2 без текста

**Файл:** `src/components/admin/payments/PaymentsTable.tsx` (строки 548-560)
```tsx
// Было:
return (
  <div className="flex items-center gap-1">
    <Badge variant="outline" className="text-xs text-muted-foreground">Не связана</Badge>
    <Button variant="ghost" ...>
      <Link2 className="h-3 w-3" />
    </Button>
  </div>
);

// Станет:
return (
  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openLinkDeal(payment)}>
    <Link2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
  </Button>
);
```

---

### 4. Тип и статус отмен/возвратов — сделать бледно-красным
**Текущее:** 
- Возврат: фиолетовый (`bg-purple-100 text-purple-700`)
- Отмена: серый (`bg-gray-100 text-gray-700`)
- Статус "Отменён": серый (`bg-gray-500/20`)

**Требуется:** Бледно-красный для визуального предупреждения

**Файл:** `src/components/admin/payments/PaymentsTable.tsx`

Изменения в `renderCell` → `case 'type'` (строки 409-423):
```tsx
// Возврат:
badgeClassName = 'bg-rose-100/60 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400';

// Отмена:
badgeClassName = 'bg-rose-100/40 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400';
```

Изменения в `getStatusBadge` (строки 319-337):
```tsx
// Отмены:
canceled: { variant: "secondary", label: "Отмена", className: "bg-rose-100/40 text-rose-500" },
cancelled: { variant: "secondary", label: "Отмена", className: "bg-rose-100/40 text-rose-500" },
voided: { variant: "secondary", label: "Отмена", className: "bg-rose-100/40 text-rose-500" },

// Возвраты:
refunded: { variant: "secondary", label: "Возврат", className: "bg-rose-100/60 text-rose-600" },
```

---

### 5. Комиссии показывать из базы bePaid (реальные, не 2%)
**Текущее:** В `PaymentsStatsPanel.tsx` комиссия = `successfulAmount * 0.0204` (оценка 2.04%)
**Реальность:** В базе `meta->>'commission_total'` уже есть реальные комиссии = **1250.92 BYN** (а не 1088.55)

**Решение 1: Добавить commission в UnifiedPayment**

**Файл:** `src/hooks/useUnifiedPayments.tsx`
1. Добавить в интерфейс `UnifiedPayment`:
```tsx
commission_total: number | null; // Реальная комиссия из bePaid
```

2. В `transformedPayments` (строка 300+) извлекать из meta:
```tsx
const meta = (p.meta || {}) as any;
...
commission_total: meta?.commission_total ? Number(meta.commission_total) : null,
```

**Решение 2: Использовать реальные данные в статистике**

**Файл:** `src/components/admin/payments/PaymentsStatsPanel.tsx`
```tsx
// Было (строки 139-166):
const fee = 0;
...
const estimatedFees = totalFees === 0 && successfulAmount > 0 
  ? successfulAmount * 0.0204 
  : totalFees;

// Станет:
// Суммировать реальные комиссии из payment.commission_total
for (const p of payments) {
  const category = classifyPayment(p.status_normalized, p.transaction_type, p.amount);
  const absAmount = Math.abs(p.amount || 0);
  const realFee = (p as any).commission_total || 0;  // Реальная комиссия
  
  if (category === 'successful') {
    successfulCount++;
    successfulAmount += absAmount;
    totalFees += realFee;  // Суммируем реальные комиссии
  }
  ...
}

// Убираем fallback на 2%:
const estimatedFees = totalFees; // Используем только реальные
```

---

## Порядок изменений

1. **PaymentsTable.tsx** — Убрать "Не связан" и "Не связана", заменить на иконки
2. **ContactLinkActions.tsx** — Убрать текст "Привязать", оставить только иконку
3. **PaymentsTable.tsx** — Цвета возврата/отмены → бледно-красный
4. **useUnifiedPayments.tsx** — Добавить `commission_total` в интерфейс и трансформацию
5. **PaymentsStatsPanel.tsx** — Использовать реальные комиссии вместо 2%

---

## Технические детали

### Реальные данные комиссий
| Источник | Сумма комиссии |
|----------|----------------|
| bepaid_statement_rows.commission_total | 1250.92 BYN |
| payments_v2.meta->>'commission_total' | 1250.92 BYN |
| Текущий UI (2% оценка) | 1088.55 BYN |
| **Разница** | **+162.37 BYN (15%)** |

### Палитра для негативных транзакций
- **Ошибки/Failed:** `bg-red-500` (яркий красный) — критично
- **Возвраты/Refund:** `bg-rose-100/60 text-rose-600` (бледно-красный) — важно
- **Отмены/Cancelled:** `bg-rose-100/40 text-rose-500` (ещё более бледный) — информативно
- **Успешные:** `bg-green-500` — позитивно

---

## DoD (Definition of Done)

- [ ] Колонка "Контакт": только иконка привязки без "Не связан"
- [ ] Колонка "Сделка": только иконка Link2 без "Не связана"
- [ ] Тип и статус возвратов/отмен — бледно-красные тона
- [ ] Комиссия в статистике = реальная сумма из bePaid (1250.92 BYN)
- [ ] Ошибка Edge Function обрабатывается gracefully
