
# План редизайна статистики платежей

## Задачи

1. **Удалить карточку "В обработке"** из `PaymentsStatsPanel`
2. **Унифицировать стиль карточек** — использовать единый компонент `GlassStatCard` для обоих панелей
3. **Применить "реальный glass" эффект** по референсу: мягкие полупрозрачные границы, усиленный blur, внутреннее свечение

---

## Анализ референса (image-880.png)

Ключевые визуальные характеристики:
- **Скруглённые углы** — `rounded-2xl` или `rounded-3xl`
- **Полупрозрачный фон** — `bg-white/5` с усиленным blur (`backdrop-blur-2xl`)
- **Мягкая граница** — `border-white/10` с внутренним свечением
- **Эффект "стеклянной капсулы"** — внутренний градиент от светлого к прозрачному
- **Тень с мягким glow** — `shadow-[0_8px_32px_rgba(0,0,0,0.12)]`

---

## Решение

### PATCH-1: Создать унифицированный компонент `GlassStatCard`

**Новый файл:** `src/components/admin/payments/GlassStatCard.tsx`

Единый компонент для обоих панелей с параметрами:
- `title` — заголовок
- `value` — основное значение (форматированная сумма)
- `subtitle` — подзаголовок (количество)
- `icon` — иконка
- `variant` — цветовая схема (`success`, `warning`, `danger`, `info`, `default`)
- `isActive`, `isClickable`, `onClick` — интерактивность

Стиль (CSS):
```tsx
className={cn(
  // Base glass effect
  "relative overflow-hidden rounded-2xl p-4",
  "bg-white/[0.08] dark:bg-white/[0.04]",
  "backdrop-blur-2xl",
  "border border-white/[0.12] dark:border-white/[0.08]",
  // Soft shadow with color glow
  "shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
  // Inner shine overlay (pseudo-element in component)
  "transition-all duration-300",
  // Hover & active states
  isClickable && "cursor-pointer hover:bg-white/[0.12] hover:border-white/[0.18] hover:scale-[1.02]",
  isActive && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
)}
```

Внутренний shine overlay (CSS-in-JSX):
```tsx
<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.08] via-transparent to-transparent pointer-events-none" />
```

### PATCH-2: Обновить `PaymentsStatsPanel`

**Файл:** `src/components/admin/payments/PaymentsStatsPanel.tsx`

Изменения:
1. **Удалить карточку "В обработке"** (строки 192-203)
2. **Заменить `StatCard` на `GlassStatCard`** с единым интерфейсом
3. **Изменить grid** — `lg:grid-cols-6` → `lg:grid-cols-5` (убрали 1 карточку)
4. **Удалить `Clock` из импортов** lucide-react
5. **Убрать `processing` из `StatsFilterType`** (опционально — или оставить для совместимости с быстрыми фильтрами)

Итоговые карточки (5 шт):
| # | Название | Иконка | Variant |
|---|----------|--------|---------|
| 1 | Успешные | CheckCircle2 | success |
| 2 | Возвраты | RotateCcw | warning |
| 3 | Отмены | XCircle | danger |
| 4 | Ошибки | XCircle | danger |
| 5 | Комиссия | Percent | info |
| 6 | Чистая выручка | TrendingUp | success |

**Примечание:** Убираем только карточку статистики "В обработке", но оставляем возможность фильтрации по этому статусу в быстрых табах (pill buttons "В обработке").

### PATCH-3: Обновить `BepaidStatementSummary`

**Файл:** `src/components/admin/payments/BepaidStatementSummary.tsx`

Изменения:
1. **Заменить локальный `StatCard` на импорт `GlassStatCard`**
2. **Адаптировать props** — унифицировать интерфейс с `PaymentsStatsPanel`
3. **Применить тот же glass-эффект**

---

## Файлы для изменения

| Файл | Действие |
|------|----------|
| `src/components/admin/payments/GlassStatCard.tsx` | **Создать** — единый glass-компонент |
| `src/components/admin/payments/PaymentsStatsPanel.tsx` | Убрать "В обработке", использовать `GlassStatCard` |
| `src/components/admin/payments/BepaidStatementSummary.tsx` | Использовать `GlassStatCard` |

---

## Ожидаемый результат

### До (текущий UI)
- Разный стиль карточек в Платежах и Выписке
- Карточка "В обработке" занимает место
- Менее выраженный glass-эффект

### После (новый UI)
- Единый стиль для всех карточек
- 5 карточек в Платежах, 6 в Выписке (с "Чистой выручкой")
- Усиленный glassmorphism: `backdrop-blur-2xl`, мягкие границы, внутреннее свечение
- Hover-анимация с масштабированием

---

## Техническая спецификация CSS Glass-эффекта

```css
.glass-stat-card {
  /* Base */
  background: linear-gradient(135deg, 
    rgba(255,255,255,0.08) 0%, 
    rgba(255,255,255,0.02) 100%
  );
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  
  /* Border */
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 1rem;
  
  /* Shadow */
  box-shadow: 
    0 8px 32px rgba(0,0,0,0.08),
    inset 0 1px 0 rgba(255,255,255,0.1);
    
  /* Inner shine */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, 
      rgba(255,255,255,0.08) 0%, 
      transparent 50%
    );
    pointer-events: none;
  }
}
```

---

## DoD (Definition of Done)

| Проверка | Критерий |
|----------|----------|
| Карточка "В обработке" | Удалена из PaymentsStatsPanel |
| Единый стиль | GlassStatCard используется в обоих компонентах |
| Glass-эффект | backdrop-blur-2xl, полупрозрачные границы, внутренний shine |
| Сетка | 5 карточек в Платежах, 6 в Выписке |
| Hover-эффект | scale-[1.02] при наведении на кликабельные карточки |
| Скрин /admin/payments | Визуальное соответствие референсу |
