

# План: Редизайн карточек статистики и диалога сверки

## Часть 1: Карточки статистики — Dark Luxury

### Текущее состояние
- Большие карточки с `rounded-3xl p-6`
- Светлое стекло `bg-white/80` с hover-эффектами `group-hover:opacity-100`
- Крупный шрифт `text-2xl md:text-3xl`
- Иконки в отдельных блоках с градиентом

### Целевой дизайн (Dark Luxury)
- **Компактный размер**: `rounded-xl p-3 md:p-4`
- **Тёмное стекло**: `bg-slate-900/70 backdrop-blur-xl border-slate-700/50`
- **Приглушённый glow**: убрать hover-glow, оставить только тонкий акцентный бордер
- **Меньший шрифт**: `text-lg md:text-xl`
- **Иконки**: в строке с заголовком, компактнее
- **Дорогие акценты**: золото, градиентные тексты

### Изменения в PaymentsStatsPanel.tsx

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  УСПЕШНЫЕ              ✓     ВОЗВРАТЫ     ↺      ОШИБКИ      ✗     ...    │
│  53 779,13 BYN               2 746,00          18 942,00                   │
│  397 шт                      31 шт             136 шт                      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Технические изменения:**
```tsx
// StatCard — новый стиль
<div className="relative rounded-xl p-3 md:p-4 border border-slate-700/40 
               bg-slate-900/60 backdrop-blur-xl overflow-hidden">
  {/* Gradient accent line top */}
  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accentGradient}" />
  
  {/* Header: title + icon inline */}
  <div className="flex items-center gap-2 mb-2">
    {icon} {/* smaller: h-4 w-4 */}
    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {title}
    </span>
  </div>
  
  {/* Amount */}
  <div className="text-lg md:text-xl font-bold tabular-nums ${colorClass}">
    {amount} <span className="text-xs text-slate-500">BYN</span>
  </div>
  
  {/* Count */}
  <div className="text-xs text-slate-500 mt-1">{count} шт</div>
</div>
```

**Цветовая палитра (Dark Luxury):**
- Успешные: `text-emerald-400` + `from-emerald-500 to-emerald-400`
- Возвраты: `text-amber-400` + `from-amber-500 to-amber-400`
- Ошибки: `text-rose-400` + `from-rose-500 to-rose-400`
- Комиссия: `text-sky-400` + `from-sky-500 to-sky-400`
- Чистая выручка: `text-purple-400` + `from-purple-500 via-fuchsia-500 to-pink-400` (gold/platinum)

---

## Часть 2: Диалог сверки — полная переработка

### Проблемы текущей реализации
1. Скролл не работает — `ScrollArea` в `CollapsibleContent` не получает корректную высоту
2. Показывается максимум 50 записей (ограничение Edge Function)
3. Мало информации о каждой записи
4. Маленький диалог `max-w-4xl`

### Новая архитектура

**Размер диалога:**
```tsx
<DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
```

**Структура:**
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Сверка с эталоном bePaid                                            [X] │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐  ┌─────────────────────────────┐ │
│ │ 📁 1-25.xlsx         [640 транзакций]  │  │ 01.01.2026 — 25.01.2026     │ │
│ └────────────────────────────────────────┘  └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│   Matched: 317    Missing: 24    Mismatch: 299    Extra: 10                 │
│   ─────────       ─────────       ──────────       ────────                 │
│                   4 803,00        Δ 5 123,00       1 204,00                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Tabs: Missing (24) | Mismatch (299) | Extra (10) | All (640)]             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  UID             │ Дата       │ File        │ DB         │ Действие   │ │
│  ├──────────────────┼────────────┼─────────────┼────────────┼────────────┤ │
│  │ abc12345-...  📋 │ 15.01 12:30│ ✓ 250.00    │ ✗ 1.00     │ Исправить  │ │
│  │ def67890-...  📋 │ 14.01 09:15│ ✓ Успешный  │ ✗ Failed   │ Исправить  │ │
│  │ ...              │            │             │            │            │ │
│  │ (виртуализация)  │            │             │            │            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ admin@example.com • superadmin                                              │
│                                [DRY-RUN]  [Применить исправления (323)]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Изменения в Edge Function

**Убрать лимит `.slice(0, 50)`:**
```typescript
// supabase/functions/bepaid-reconcile-file/index.ts, строки 416-419
// БЫЛО:
missing: missing.slice(0, 50),
extra: extra.slice(0, 50),
mismatches: mismatches.slice(0, 50),

// СТАНЕТ:
missing: missing,
extra: extra,
mismatches: mismatches,
```

**Расширить интерфейс FileTransaction (добавить поля из файла):**
Уже есть: `uid, status, transaction_type, amount, currency, paid_at, customer_email, card_last4, card_holder, card_brand`

**Расширить missing/mismatch/extra в ответе:**
```typescript
missing: Array<{ 
  uid: string; 
  status: string; 
  amount: number; 
  transaction_type: string;
  paid_at?: string;
  customer_email?: string;
  card_last4?: string;
}>;

mismatches: Array<{ 
  uid: string; 
  file_status: string; 
  db_status: string;
  file_amount: number;
  db_amount: number;
  file_type?: string;
  db_type?: string;
  mismatch_type: 'status' | 'amount' | 'type';
  paid_at?: string;
  customer_email?: string;
  db_id?: string;
  db_order_id?: string;
}>;

extra: Array<{
  uid: string;
  amount: number;
  status: string;
  db_id: string;
  paid_at?: string;
  customer_email?: string;
  db_order_id?: string;
}>;
```

### Виртуализация таблицы

**Использовать `@tanstack/react-virtual`** (уже установлен):
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: currentItems.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48, // row height
  overscan: 10,
});

<div ref={parentRef} className="flex-1 overflow-auto">
  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
      const item = currentItems[virtualRow.index];
      return (
        <div
          key={virtualRow.key}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
          }}
        >
          <TableRow item={item} />
        </div>
      );
    })}
  </div>
</div>
```

### Колонки таблицы

| Колонка | Missing | Mismatch | Extra |
|---------|---------|----------|-------|
| UID + 📋 | ✓ | ✓ | ✓ |
| Дата | ✓ | ✓ | ✓ |
| File Сумма | ✓ | ✓ (зелёный) | — |
| DB Сумма | — | ✓ (красный) | ✓ |
| File Статус | ✓ | ✓ | — |
| DB Статус | — | ✓ | ✓ |
| Тип | ✓ | ✓ | ✓ |
| Email | ✓ | ✓ | ✓ |
| Карта | ✓ | ✓ | ✓ |
| Δ (разница) | — | ✓ | — |
| Действие | Добавить | Исправить | Пометить |

### Быстрые действия

- **📋 Copy UID**: копировать в буфер обмена
- **🔗 Открыть в таблице**: `navigator(?search=uid)`

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/components/admin/payments/PaymentsStatsPanel.tsx` | Полный редизайн: Dark Luxury, компактнее, новые стили |
| `src/components/admin/payments/ReconcileFileDialog.tsx` | Полная переработка: большой диалог, табы, виртуализация, полные данные |
| `supabase/functions/bepaid-reconcile-file/index.ts` | Убрать `.slice(0, 50)`, расширить поля в ответе |

---

## Технические заметки

### PaymentsStatsPanel.tsx — структура изменений
- Строки 23-77: переписать `StatCard` компонент
- Строки 161-206: обновить grid layout и передаваемые пропсы

### ReconcileFileDialog.tsx — структура изменений
- Строка 330: увеличить `max-w-4xl` → `max-w-6xl h-[90vh]`
- Строки 340-574: полностью переписать UI с табами и виртуализацией
- Добавить: `useVirtualizer`, `useRef`, `useState` для активного таба
- Добавить: `copyToClipboard` функцию

### Edge Function — строки для изменения
- Строки 416-419: убрать `.slice(0, 50)`
- Строки 48-65: расширить интерфейс `ReconcileResult`
- Строки 241-252, 330-383: добавить дополнительные поля в массивы

---

## Результат

После изменений:
1. **Карточки** — компактные, тёмное стекло, градиентные акценты, элегантный вид
2. **Сверка** — полноэкранный диалог с виртуализированными таблицами, все 640 транзакций видны сразу, полные реквизиты File vs DB, кнопки действий

