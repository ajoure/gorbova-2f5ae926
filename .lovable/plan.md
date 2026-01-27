
# План унификации стилей UI на странице /admin/payments

## Выявленные проблемы

### 1. Обрезка обводки статистических плашек
На скриншоте видно, что активная плашка "Успешные" имеет синюю обводку (`ring-2 ring-primary`), которая заходит за границы контейнера сверху из-за недостаточного отступа.

### 2. Разнородные стили кнопок/контролов
Сейчас на странице разные стили:
- TimezoneSelector: `h-8 text-xs` — **эталон**
- Табы Hub: `px-3 py-1.5 text-xs`
- DatePeriodSelector: `h-9 gap-2` — крупнее
- Pill tabs (Успешные/Все/Ошибки): `px-3 py-1 text-xs`
- Sync button: `h-8 gap-1 text-xs`
- Filters button: `h-9 gap-2 text-xs` — крупнее
- Сбросить: `h-9 text-xs` — крупнее

---

## Решение

### A. Добавить отступ над статистическими плашками

**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Изменить строку 345-346:
```tsx
// Было:
<div className="space-y-3">
  {/* 1. Stats Panel - на самом верху после вкладок */}
  <PaymentsStatsPanel ... />

// Станет:
<div className="space-y-3">
  {/* 1. Stats Panel - на самом верху после вкладок */}
  <div className="pt-1">
    <PaymentsStatsPanel ... />
  </div>
```

Альтернативно: добавить `mt-1` к грид-контейнеру в `PaymentsStatsPanel.tsx` строка 202.

---

### B. Унифицировать стили кнопок — эталон: `h-8 text-xs`

#### B1. Главные табы Hub (`AdminPaymentsHub.tsx`)
**Файл:** `src/pages/admin/AdminPaymentsHub.tsx`

Строка 52-57 — добавить `h-8` и жирный шрифт для активных:
```tsx
className={cn(
  "relative flex items-center gap-1.5 px-3 h-8 rounded-full text-xs transition-all duration-200 whitespace-nowrap",
  isActive 
    ? "bg-background text-foreground shadow-sm font-semibold"  // жирный если активен
    : "text-muted-foreground hover:text-foreground font-medium"
)}
```

#### B2. DatePeriodSelector (`period-selector.tsx`)
**Файл:** `src/components/ui/period-selector.tsx`

Строка 272-285 — уменьшить высоту до `h-8`:
```tsx
<Button
  variant="outline"
  className={cn(
    "h-8 gap-2 px-3 text-xs",  // было h-9
    "bg-background/60 backdrop-blur-sm border-border/50",
    ...
  )}
>
  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />  // уменьшить иконку
  <span className="font-medium text-xs">{formatPeriodLabel(value)}</span>
  <ChevronDown className="h-3 w-3 text-muted-foreground" />  // было 3.5
</Button>
```

#### B3. Pill status tabs (Успешные/Все/Ошибки)
**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Строка 379 — унифицировать с Hub табами:
```tsx
className={cn(
  "relative flex items-center gap-1.5 px-3 h-8 rounded-full text-xs transition-all duration-200 whitespace-nowrap",
  isActive
    ? "bg-background text-foreground shadow-sm font-semibold"
    : "text-muted-foreground hover:text-foreground font-medium"
)}
```

#### B4. Sync button
**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Строка 400 — уже `h-8`, добавить только консистентный стиль:
```tsx
<Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs font-medium">
```

#### B5. Кнопка "Фильтры"
**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Строка 487-498 — уменьшить с `h-9` до `h-8`:
```tsx
<Button 
  variant={showFilters ? "secondary" : "outline"} 
  size="sm"
  onClick={() => setShowFilters(!showFilters)}
  className="h-8 gap-1.5 px-3 text-xs font-medium"  // было h-9 gap-2
>
```

#### B6. Кнопка "Сбросить"
**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Строка 501 — уменьшить с `h-9` до `h-8`:
```tsx
<Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 px-3 text-xs font-medium">
```

#### B7. Search Input
Оставить `h-9` для поля ввода — это стандарт для инпутов, они чуть выше кнопок.

---

## Сводка изменений

| Элемент | Было | Станет |
|---------|------|--------|
| Stats container | `<PaymentsStatsPanel />` | `<div className="pt-1">...</div>` |
| Hub tabs height | `py-1.5` | `h-8 font-semibold (active)` |
| DatePeriodSelector | `h-9` | `h-8 text-xs` |
| Pill tabs | `py-1` | `h-8 font-semibold (active)` |
| Sync button | `h-8` (ok) | `px-3 font-medium` |
| Filters button | `h-9` | `h-8` |
| Сбросить button | `h-9` | `h-8` |

---

## Файлы для изменения

1. `src/components/admin/payments/PaymentsTabContent.tsx` — отступ над stats, унификация кнопок
2. `src/pages/admin/AdminPaymentsHub.tsx` — стиль главных табов
3. `src/components/ui/period-selector.tsx` — высота DatePeriodSelector

---

## Визуальный результат

- Все кнопки и табы одинаковой высоты `h-8` (32px)
- Все шрифты `text-xs` (12px)
- Активные элементы: `font-semibold` (жирный)
- Неактивные: `font-medium` (средний)
- Обводка плашек полностью видна благодаря `pt-1`
