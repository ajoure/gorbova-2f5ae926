
# План исправления: Формула "Чистая выручка" и удаление карточки "Перечислено"

## Обнаруженные проблемы

### 1. Неверная формула "Чистая выручка"

**Текущая формула (НЕПРАВИЛЬНО):**
```typescript
netRevenue = successful_amount - refunded_amount - commission_total
// 14,764 - 195 - 176.33 = 14,392.67 BYN ← на скриншоте
```

**Правильная формула:**
```typescript
netRevenue = successful_amount - refunded_amount - cancelled_amount - commission_total
// 14,764 - 195 - 14 - 176.33 = 14,378.67 BYN
```

**Проблема:** Не вычитаются отмены (`cancelled_amount`).

### 2. Карточка "Перечислено" не нужна

Пользователь объясняет:
- "Перечислено" концептуально должно равняться "Чистой выручке"
- В реальности `payout_amount` в выписке BePaid — это банковские переводы, которые происходят с задержкой
- Показывать 8,268.67 BYN вместо 14,378.67 BYN сбивает с толку
- **Решение:** Удалить карточку "Перечислено" из обоих табов

### 3. Ошибки не входят в расчёт денег

Ошибки (36 шт / 5,657 BYN) — это неудавшиеся попытки оплаты:
- Деньги НЕ поступали → не включать в денежные расчёты
- Нужны только для общего количества транзакций: 71 + 1 + 14 + 36 = 122 шт

### 4. Применить ту же логику к "Выписке BePaid"

Добавить карточку "Чистая выручка" в `BepaidStatementSummary` с формулой:
```
Чистая выручка = Платежи - Возвраты - Отмены - Комиссия
```

---

## Решение

### PATCH-1: Исправить формулу в PaymentsStatsPanel.tsx

**Файл:** `src/components/admin/payments/PaymentsStatsPanel.tsx`

```typescript
// Строки 134-137 — исправить формулу:
// БЫЛО:
const netRevenue = serverStats.successful_amount 
  - serverStats.refunded_amount 
  - serverStats.commission_total;

// СТАЛО:
const netRevenue = serverStats.successful_amount 
  - serverStats.refunded_amount 
  - serverStats.cancelled_amount  // ДОБАВИТЬ!
  - serverStats.commission_total;
```

### PATCH-2: Удалить карточку "Перечислено" из PaymentsStatsPanel

**Файл:** `src/components/admin/payments/PaymentsStatsPanel.tsx`

Удалить строки 245-254:
```typescript
// УДАЛИТЬ:
<StatCard
  title="Перечислено"
  amount={stats.payout}
  count={stats.successful.count}
  subtitle="из выписки"
  icon={<Wallet className="h-4 w-4 text-teal-500" />}
  colorClass="text-teal-500"
  accentGradient="from-teal-500 to-cyan-400"
  isClickable={false}
/>
```

Также удалить:
- `Wallet` из импорта lucide-react
- `payout` из объекта `stats` в useMemo
- Изменить grid: `lg:grid-cols-7` → `lg:grid-cols-7` (оставить 7, т.к. останется 7 карточек: Успешные, Возвраты, В обработке, Отмены, Ошибки, Комиссия, Чистая выручка)

### PATCH-3: Обновить BepaidStatementSummary

**Файл:** `src/components/admin/payments/BepaidStatementSummary.tsx`

1. Добавить карточку "Чистая выручка":
```typescript
// Вычислить:
const netRevenue = data.payments_amount 
  - data.refunds_amount 
  - data.cancellations_amount 
  - data.commission_total;
```

2. Удалить карточку "Перечислено"

3. Изменить grid: `md:grid-cols-6` → `md:grid-cols-6` (будет: Платежи, Возвраты, Отмены, Ошибки, Комиссия, Чистая выручка)

### PATCH-4: Обновить интерфейс BepaidStatementStats (если нужно)

**Файл:** `src/hooks/useBepaidStatement.ts`

Интерфейс `BepaidStatementStats` уже содержит все нужные поля. Изменения не требуются.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/admin/payments/PaymentsStatsPanel.tsx` | Исправить формулу `netRevenue`, удалить карточку "Перечислено" |
| `src/components/admin/payments/BepaidStatementSummary.tsx` | Удалить "Перечислено", добавить "Чистая выручка" |

---

## Ожидаемый результат

### Таб "Платежи" (/admin/payments)

| Карточка | Было | Станет |
|----------|------|--------|
| Успешные | 14,764.00 BYN / 71 шт | 14,764.00 BYN / 71 шт ✓ |
| Возвраты | 195.00 BYN / 1 шт | 195.00 BYN / 1 шт ✓ |
| В обработке | 0.00 BYN / 0 шт | 0.00 BYN / 0 шт ✓ |
| Отмены | 14.00 BYN / 14 шт | 14.00 BYN / 14 шт ✓ |
| Ошибки | 5,657.00 BYN / 36 шт | 5,657.00 BYN / 36 шт ✓ |
| Комиссия | 176.33 BYN | 176.33 BYN ✓ |
| Чистая выручка | 14,392.67 BYN | **14,378.67 BYN** (было без отмен) |
| ~~Перечислено~~ | ~~8,268.67 BYN~~ | **УДАЛЕНО** |

### Таб "Выписка BePaid" (/admin/payments/statement)

| Карточка | Было | Станет |
|----------|------|--------|
| Платежи | 14,514.00 BYN / 70 шт | 14,514.00 BYN / 70 шт ✓ |
| Возвраты | 195.00 BYN / 1 шт | 195.00 BYN / 1 шт ✓ |
| Отмены | 14.00 BYN / 14 шт | 14.00 BYN / 14 шт ✓ |
| Ошибки | 5,657.00 BYN / 36 шт | 5,657.00 BYN / 36 шт ✓ |
| Комиссия | 176.33 BYN | 176.33 BYN ✓ |
| ~~Перечислено~~ | ~~8,268.67 BYN~~ | **УДАЛЕНО** |
| Чистая выручка | — | **14,128.67 BYN** (новая) |

---

## Формула расчёта (финальная)

```text
Чистая выручка = Успешные - Возвраты - Отмены - Комиссия
               = 14,764 - 195 - 14 - 176.33 = 14,378.67 BYN (Платежи)
               = 14,514 - 195 - 14 - 176.33 = 14,128.67 BYN (Выписка)
```

> Небольшая разница (250 BYN / 1 платёж) — разные источники данных: 
> `payments_v2` (все платежи) vs `bepaid_statement_rows` (только импортированная выписка)

---

## DoD (Definition of Done)

| Проверка | Ожидаемый результат |
|----------|---------------------|
| Формула netRevenue включает отмены | `successful - refunded - cancelled - commission` |
| Карточка "Перечислено" удалена | Нет в обоих табах |
| Карточка "Чистая выручка" в Выписке BePaid | Добавлена с правильной формулой |
| Ошибки не участвуют в расчёте | Только для подсчёта транзакций |
| Скрин /admin/payments | Показать статистику февраля |
| Скрин /admin/payments/statement | Показать статистику февраля |
