
# План: Исправление расчёта срока подписки и времени истечения доступа

## Обнаруженные проблемы

### Проблема 1: 30 дней вместо календарного месяца

**Пример из БД:**
- Подписка Бачко Анастасия: `access_start_at: 2025-12-29 00:30:31` → `access_end_at: 2026-01-28 00:30:31`
- Это ровно **30 дней**, но должен быть **1 месяц** (29.12 → 29.01)

**Причины в коде:**
1. `subscription-charge` (строка 1044-1045): `newEndDate.setDate(newEndDate.getDate() + (tariff.access_days || 30))`
2. `bepaid-report-import` (строки 456-458, 565-567): `subscriptionEnd.setDate(subscriptionEnd.getDate() + 30)`
3. `getcourse-import-deals` (строки 678-685): `accessEndAt.setDate(accessEndAt.getDate() + 30)`
4. `getcourse-import-file` (строки 243-245): `endDate.setDate(endDate.getDate() + 30)`

**Уже исправлено в:**
- `grant-access-for-order` — использует `getUTCMonth() + 1` для клуба
- `admin-manual-charge` — использует `getUTCMonth() + 1` для клуба
- `admin-fix-club-billing-dates` — использует календарный месяц

### Проблема 2: Доступ закрывается сразу после `access_end_at`

**Пример:**
- `access_end_at: 2026-01-28 00:30:31+00` (28 января в 00:30 UTC = 03:30 по Минску)
- Статус стал `expired` в `01:00:15+00` UTC (через 30 минут)
- Пользователь ожидает: доступ до конца суток 28 января (23:59 по Минску)

**Причина:**
- `subscriptions-reconcile` (строка 204): `.lt('access_end_at', now.toISOString())`
- Это сравнивает точное время, а не дату

### Проблема 3: Попытки списания только утром

**Текущее расписание cron:**
- `subscription-charge-morning`: 06:00 UTC (09:00 Минск)
- `subscription-charge-evening`: 18:00 UTC (21:00 Минск)

Cron работает корректно (две попытки в день), но логика проверки окна (±15 минут) может блокировать списание если cron вызван не точно в указанное время.

---

## Решение

### Часть 1: Календарный месяц для клуба

Изменить расчёт `access_end_at` во всех местах, где используется `+30 дней`:

| Файл | Изменение |
|------|-----------|
| `subscription-charge/index.ts` | Строки 1044-1045: использовать `getUTCMonth() + 1` для клуба |
| `bepaid-report-import/index.ts` | Строки 456-458, 565-567: аналогично |
| `getcourse-import-deals/index.ts` | Строки 678-685: аналогично |
| `getcourse-import-file/index.ts` | Строки 243-245: аналогично |

**Код для subscription-charge (строки 1043-1048):**
```typescript
// Extend subscription - calendar month for club, days for others
const isClubProduct = subscription?.product_id === "11c9f1b8-0355-4753-bd74-40b42aa53616";
let newEndDate: Date;

if (isClubProduct) {
  // Calendar month: 22.01 → 22.02 (same day next month)
  const now = new Date();
  newEndDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    21, 0, 0  // 21:00 UTC = 00:00 следующего дня по Минску
  ));
  
  // Edge case: 31 Jan → 28/29 Feb
  if (newEndDate.getUTCDate() !== now.getUTCDate()) {
    newEndDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + 2,
      0,  // Last day of month
      21, 0, 0
    ));
  }
} else {
  newEndDate = new Date();
  newEndDate.setDate(newEndDate.getDate() + (tariff.access_days || 30));
}
```

### Часть 2: Доступ до конца суток

Изменить логику сравнения в `subscriptions-reconcile` — использовать **конец суток по Минску**, а не текущее время.

**Текущая логика (строки 200-205):**
```typescript
// Закрывает доступ если access_end_at < now
.lt('access_end_at', now.toISOString())
```

**Новая логика:**
```typescript
// Закрывает доступ только если access_end_at < начало СЕГОДНЯШНЕГО дня по Минску
// Т.е. если срок был "28 января", доступ закрывается только 29 января
const minskMidnight = new Date();
minskMidnight.setUTCHours(21, 0, 0, 0); // 21:00 UTC = 00:00 Minsk next day
if (minskMidnight > new Date()) {
  minskMidnight.setDate(minskMidnight.getDate() - 1); // Yesterday's midnight
}
// .lt('access_end_at', minskMidnight.toISOString())
```

**Альтернатива (проще):** При создании подписки устанавливать `access_end_at` на 23:59 последнего дня:

```typescript
// access_end_at = конец дня N-ного числа (21:00 UTC = 00:00 Minsk следующего дня)
accessEndAt = new Date(Date.UTC(
  startDate.getUTCFullYear(),
  startDate.getUTCMonth() + 1,
  startDate.getUTCDate(),
  21, 0, 0  // 21:00 UTC = конец дня по Минску
));
```

### Часть 3: Гарантированные две попытки списания

Текущая логика charge window (±15 минут) может быть слишком жёсткой. Расширить окно:

**Изменить в subscription-charge (строки 607-608):**
```typescript
// Было: const WINDOW_TOLERANCE_MINUTES = 15;
const WINDOW_TOLERANCE_MINUTES = 60; // ±1 час для надёжности
```

Или убрать проверку окна вообще для подписок в grace period.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/subscription-charge/index.ts` | 1) Строки 1043-1048: календарный месяц для клуба; 2) Расширить charge window |
| `supabase/functions/subscriptions-reconcile/index.ts` | Строки 200-205: сравнивать с концом дня, а не текущим временем |
| `supabase/functions/bepaid-report-import/index.ts` | Строки 456-458, 565-567: календарный месяц для клуба |
| `supabase/functions/getcourse-import-deals/index.ts` | Строки 678-685: календарный месяц для клуба |
| `supabase/functions/getcourse-import-file/index.ts` | Строки 243-245: календарный месяц для клуба |

---

## Техническое пояснение

### Расчёт календарного месяца

```typescript
const CLUB_PRODUCT_ID = "11c9f1b8-0355-4753-bd74-40b42aa53616";

function calculateCalendarMonthEnd(startDate: Date): Date {
  const endDate = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth() + 1,
    startDate.getUTCDate(),
    21, 0, 0  // 21:00 UTC = 00:00 Minsk (конец дня)
  ));
  
  // Edge case: 31.01 → 28/29.02 (ограничить последним днём месяца)
  if (endDate.getUTCDate() !== startDate.getUTCDate()) {
    return new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 2,
      0,  // 0 = последний день предыдущего месяца
      21, 0, 0
    ));
  }
  
  return endDate;
}
```

### Примеры:
- 27.01.2026 → 27.02.2026 21:00 UTC (28.02 00:00 Minsk)
- 29.12.2025 → 29.01.2026 21:00 UTC (30.01 00:00 Minsk)
- 31.01.2026 → 28.02.2026 21:00 UTC (последний день февраля)

---

## Результат

1. **Срок подписки = 1 календарный месяц** (27.01 → 27.02, а не 26.02)
2. **Доступ до конца указанного дня** (до 28.01 23:59 по Минску, если срок "28.01")
3. **Гарантированные попытки списания** в день окончания (утром и вечером)
4. **Только после 00:00 следующего дня** — доступ закрывается (если оплата не прошла)
