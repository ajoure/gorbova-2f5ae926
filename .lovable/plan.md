
# PATCH: Статистическая панель + полная сверка и ремонт платежей по эталону bePaid (копейка в копейку)

## Эталон bePaid (01.01-25.01.2026)
| Категория | Количество | Сумма BYN | Комиссия BYN |
|-----------|------------|-----------|--------------|
| Платеж Успешный | **388** | **51,973.13** | 1,061.78 |
| Платеж Неуспешный | 152 | 22,792.00 | 0 |
| Возврат средств | 19 | 2,585.00 | 63.28 |
| Отмена | 81 | 628.00 | 0 |
| **ИТОГО** | **640** | | **1,125.06** |

## Текущее состояние базы
| Категория | Количество | Сумма BYN | Дельта |
|-----------|------------|-----------|--------|
| Успешные | 328 | 45,846.13 | -60 шт, -6,127 BYN |
| Неуспешные | 87 | 15,561.00 | -65 шт |
| Возвраты | 28 | 2,169.00 | +9 шт (лишние?) |
| Отмены | 13 | 411.00 | -68 шт |
| **ИТОГО** | **464** | | **-176 шт** |

---

## Блок 1: Статистическая панель (Glass Morphism)

### 1.1 Создать компонент PaymentsStatsPanel

**Файл:** `src/components/admin/payments/PaymentsStatsPanel.tsx`

**Дизайн (5 карточек в ряд):**
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│ │   УСПЕШНЫЕ   │ │   ВОЗВРАТЫ   │ │    ОШИБКИ    │ │   КОМИССИЯ   │ │   ЧИСТАЯ     │  │
│ │              │ │              │ │              │ │              │ │   ВЫРУЧКА    │  │
│ │  51,973 BYN  │ │  2,585 BYN   │ │  22,792 BYN  │ │  1,125 BYN   │ │ 48,263 BYN   │  │
│ │    388 шт    │ │    19 шт     │ │   152 шт     │ │    2.0%      │ │              │  │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                                        │
│ Период: 01.01.2026 - 25.01.2026                                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Стиль Glass Morphism:**
- `backdrop-blur-xl`
- `bg-gradient-to-br from-card/80 to-card/50`
- `border border-border/30`
- Цвета: зелёный (успешные), оранжевый (возвраты), красный (ошибки), синий (комиссия), изумрудный (чистая выручка)

**Формула чистой выручки:**
```
Чистая выручка = Сумма успешных − Возвраты − Комиссия
               = 51,973.13 − 2,585.00 − 1,125.06 = 48,263.07 BYN
```

### 1.2 Интегрировать в PaymentsTabContent

**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Добавить `<PaymentsStatsPanel />` между toolbar и Card с таблицей.

### 1.3 DoD блока 1
- На экране видны 5 карточек: Успешные, Возвраты, Ошибки, Комиссия, Чистая выручка
- Значения пересчитываются при изменении фильтра периода
- Чистая выручка = Сумма − Комиссия (формула соблюдается)

---

## Блок 2: Ремонт 7 "ложных успешных" платежей

### 2.1 Выявленные кейсы

При детальном анализе найдено **не 7, а больше** проблемных записей:

**Тип A: Транзакции с отрицательной суммой и типом `payment` (должны быть refund):**
| UID | Сумма | Статус | Действие |
|-----|-------|--------|----------|
| d788b73c-defa-4473-8adf-a4dc5e5f160a | -1.00 | succeeded / payment | Исправить тип на refund |
| 34ec7bfa-bcf9-442a-98ac-d182f38ba2ee | -1.00 | succeeded / payment | Исправить тип на refund |
| b9e28c61-4e32-4c9f-8727-fab86217de98 | -1.00 | succeeded / payment | Исправить тип на refund |
| f58f89a4-7475-4eef-b2f9-e75119e0dab4 | -250.00 | succeeded / payment | Исправить тип на refund |
| fb4b5c7c-3627-4cd2-9a6f-867a41220562 | -77.00 | succeeded / payment | Исправить тип на refund |
| 146a4166-04a4-413c-be5a-1c2ff6228592 | -250.00 | canceled / payment | Исправить тип на refund |

**Тип B: Токенизация карт (сумма = 0):**
| UID | Сумма | Статус | Действие |
|-----|-------|--------|----------|
| 86e45f03-69f0-426c-b835-6820ee21a90a | 0.00 | succeeded | Не учитывать в статистике успешных платежей |
| a217deb8-83e2-45a4-bd29-a9d397c4b509 | 0.00 | succeeded | Не учитывать в статистике успешных платежей |

### 2.2 Алгоритм исправления (строгий)

Для каждого кейса:

1. **Найти payment** по UID и определить связанный profile
2. **Найти все связанные сущности:** orders, subscriptions, entitlements, telegram_access
3. **Определить наличие других валидных доступов:**
   - Если есть другие paid orders / active subscriptions → доступы НЕ трогать
   - Если доступ выдан ТОЛЬКО на основании ошибочного платежа → отозвать
4. **Исправить данные:**
   - payment: изменить transaction_type / status / пометить meta.is_invalid
   - order: изменить status на cancelled (если создан ошибочно)
   - subscription: отключить auto_renew (если привязана к ошибке)
   - entitlement: отозвать (только если нет других оснований)

### 2.3 Реализация: Edge Function + UI Tool

**Файл:** `supabase/functions/admin-fix-false-payments/index.ts`

```typescript
interface FixRequest {
  payment_uids: string[];
  dry_run: boolean;
  limit?: number;
}

interface FixResult {
  success: boolean;
  dry_run: boolean;
  cases: Array<{
    uid: string;
    contact_email: string;
    action_taken: 'status_fixed' | 'access_revoked' | 'access_kept' | 'skipped';
    has_other_valid_access: boolean;
    details: {
      payment_id: string;
      order_ids: string[];
      subscription_ids: string[];
      entitlement_ids: string[];
    };
  }>;
  audit_actions: string[];
}
```

**Audit logs (SYSTEM ACTOR):**
- `payment.fix_case_dry_run` — при dry-run
- `payment.fix_case_executed` — при execute
- `access.revoke_safe` — при отзыве доступа
- `order.deleted_as_invalid` — при аннулировании сделки

Meta содержит: uid, contact_id, список изменённых id, признак `other_valid_access_present`

### 2.4 DoD блока 2
- Ошибочные "успешные" платежи не создают покупку/доступ
- У пользователей с валидной покупкой доступ НЕ отозван
- В audit_logs есть записи system actor по каждому кейсу
- DRY-RUN показывает список затронутых сущностей перед EXECUTE

---

## Блок 3: Полная сверка bePaid файл = эталон

### 3.1 Дельта до достижения 640 транзакций

**Текущее состояние:** 464 транзакции
**Нужно:** 640 транзакций
**Дельта:** +176 транзакций

**Источники для добавления:**

| Источник | Количество | Сумма BYN | Статус |
|----------|------------|-----------|--------|
| payment_reconcile_queue (succeeded) | 71 | 8,477.00 | Материализовать |
| payment_reconcile_queue (canceled) | 56 | 56.00 | Материализовать |
| payment_reconcile_queue (failed) | 40 | 1,881.00 | Материализовать |
| payment_reconcile_queue (refunded) | 1 | 250.00 | Материализовать |
| **Из очереди итого** | **168** | | |
| **Остаток из файла** | **8** | | Импортировать напрямую |

### 3.2 План достижения 640 транзакций

**Шаг 1:** Материализовать 168 транзакций из `payment_reconcile_queue`
```
После: 464 + 168 = 632 транзакции
```

**Шаг 2:** Импортировать 8 недостающих транзакций из файла bePaid
```
После: 632 + 8 = 640 транзакций
```

**Шаг 3:** Исправить 6 транзакций с неверным типом (payment → refund)
```
Это уменьшит "успешные" и увеличит "возвраты" до правильных значений
```

### 3.3 Reconcile функция (усиленная)

**Файл:** `supabase/functions/bepaid-reconcile-file/index.ts` (существует, дополнить)

**Обязательные проверки для каждой строки файла:**
- UID транзакции
- Сумма (amount)
- Статус (status)
- Тип операции (transaction_type)
- Время (paid_at) — с учётом Europe/Minsk
- Карта (last4 / brand)

**Выход reconcile:**
```typescript
interface ReconcileResult {
  matched: number;           // Сопоставлено 1:1
  missing_in_db: Array<{     // Есть в файле, нет в БД
    uid: string;
    amount: number;
    status: string;
  }>;
  extra_in_db: Array<{       // Есть в БД, нет в файле
    uid: string;
    amount: number;
  }>;
  status_mismatch: Array<{   // UID совпадает, статус разный
    uid: string;
    file_status: string;
    db_status: string;
  }>;
  amount_mismatch: Array<{   // UID совпадает, сумма разная
    uid: string;
    file_amount: number;
    db_amount: number;
  }>;
  summary: {
    file_total: number;
    file_amount: number;
    db_total: number;
    db_amount: number;
    fees_total: number;
    net_revenue: number;
  };
}
```

### 3.4 DoD блока 3
- После reconcile количество = 640 транзакций
- Суммы совпадают:
  - Успешные: 388 шт = 51,973.13 BYN
  - Возвраты: 19 шт = 2,585.00 BYN
  - Отмены: 81 шт = 628.00 BYN
  - Неуспешные: 152 шт
- Любая строка файла либо сопоставлена 1:1, либо в отчёте с причиной

---

## Блок 4: Timezone переключатель

### 4.1 Проблема

Переключатель `My TZ / UTC / Provider` визуально присутствует в `PaymentsTabContent.tsx`, но **не подключён** к форматированию дат в таблице.

### 4.2 Решение

**Файл:** `src/components/admin/payments/PaymentsTable.tsx`

1. Добавить prop `displayTimezone: 'user' | 'utc' | 'provider'`
2. Создать утилиту форматирования:

```typescript
import { formatInTimeZone } from 'date-fns-tz';

function formatPaymentTime(
  utcDate: string,
  mode: 'user' | 'utc' | 'provider',
  userTimezone: string = 'Europe/Minsk'
): string {
  const date = new Date(utcDate);
  
  switch (mode) {
    case 'utc':
      return formatInTimeZone(date, 'UTC', 'dd.MM.yy HH:mm');
    case 'provider':
      return formatInTimeZone(date, 'Europe/Minsk', 'dd.MM.yy HH:mm');
    case 'user':
    default:
      return formatInTimeZone(date, userTimezone, 'dd.MM.yy HH:mm');
  }
}
```

3. Применить в рендере колонки `date`:
```typescript
case 'date':
  return (
    <span className="whitespace-nowrap text-xs">
      {payment.paid_at 
        ? formatPaymentTime(payment.paid_at, displayTimezone, userTimezone) 
        : "—"}
    </span>
  );
```

**Файл:** `src/components/admin/payments/PaymentsTabContent.tsx`

Передать `displayTimezone` в `PaymentsTable`:
```tsx
<PaymentsTable
  payments={filteredPayments}
  displayTimezone={displayTimezone}
  // ...остальные props
/>
```

### 4.3 DoD блока 4
- При переключении режимов время в таблице заметно меняется
- UTC показывает время -3 часа от Minsk
- Provider TZ = Europe/Minsk (время bePaid)
- Нет "съезда дат" и дублей из-за TZ

---

## Блок 5: Порядок выполнения

| Шаг | Действие | Результат |
|-----|----------|-----------|
| 1 | Создать `PaymentsStatsPanel.tsx` | UI панель со статистикой |
| 2 | Интегрировать в `PaymentsTabContent.tsx` | Панель видна над таблицей |
| 3 | Подключить timezone в `PaymentsTable.tsx` | Переключатель работает |
| 4 | Запустить reconcile DRY-RUN | Отчёт о расхождениях |
| 5 | Материализовать 168 транзакций из queue | +168 записей в payments_v2 |
| 6 | Импортировать 8 недостающих из файла | +8 записей |
| 7 | Исправить 6 транзакций payment → refund | Корректные типы |
| 8 | Исправить "ложные успешные" (блок 2) | Ошибки не создают доступ |
| 9 | Финальная сверка | 640 транзакций, суммы бьются |

---

## Блок 6: Итоговые проверки (DoD)

### SQL проверки

```sql
-- 1) Общее количество = 640
SELECT COUNT(*) FROM payments_v2
WHERE provider = 'bepaid'
  AND paid_at >= '2026-01-01' AND paid_at < '2026-01-26';
-- Ожидаемо: 640

-- 2) Успешные = 388, сумма = 51,973.13
SELECT COUNT(*), ROUND(SUM(amount)::numeric, 2)
FROM payments_v2
WHERE provider = 'bepaid'
  AND paid_at >= '2026-01-01' AND paid_at < '2026-01-26'
  AND status = 'succeeded'
  AND transaction_type NOT IN ('refund', 'void')
  AND amount > 0;
-- Ожидаемо: 388, 51973.13

-- 3) Возвраты = 19, сумма = 2,585.00
SELECT COUNT(*), ROUND(SUM(ABS(amount))::numeric, 2)
FROM payments_v2
WHERE provider = 'bepaid'
  AND paid_at >= '2026-01-01' AND paid_at < '2026-01-26'
  AND (transaction_type = 'refund' OR status = 'refunded');
-- Ожидаемо: 19, 2585.00

-- 4) Отмены = 81, сумма = 628.00
SELECT COUNT(*), ROUND(SUM(ABS(amount))::numeric, 2)
FROM payments_v2
WHERE provider = 'bepaid'
  AND paid_at >= '2026-01-01' AND paid_at < '2026-01-26'
  AND (transaction_type = 'void' OR status = 'canceled');
-- Ожидаемо: 81, 628.00

-- 5) Неуспешные = 152
SELECT COUNT(*)
FROM payments_v2
WHERE provider = 'bepaid'
  AND paid_at >= '2026-01-01' AND paid_at < '2026-01-26'
  AND status = 'failed';
-- Ожидаемо: 152
```

### UI проверки (из 1@ajoure.by)
- Скрин: PaymentsStatsPanel с 5 карточками
- Скрин: Чистая выручка = Сумма − Комиссия (48,263.07 BYN)
- Скрин: Timezone переключатель работает (3 режима)

### Audit logs (SYSTEM ACTOR)

```sql
SELECT action, COUNT(*) FROM audit_logs
WHERE actor_type = 'system'
  AND action IN (
    'payment.fix_case_dry_run',
    'payment.fix_case_executed',
    'access.revoke_safe',
    'order.deleted_as_invalid',
    'bepaid_file_reconcile'
  )
  AND created_at >= '2026-01-26'
GROUP BY action;
```

---

## Файлы для создания/изменения

| Файл | Действие |
|------|----------|
| `src/components/admin/payments/PaymentsStatsPanel.tsx` | CREATE |
| `src/components/admin/payments/PaymentsTabContent.tsx` | EDIT (добавить панель + передать TZ) |
| `src/components/admin/payments/PaymentsTable.tsx` | EDIT (подключить TZ форматирование) |
| `supabase/functions/admin-fix-false-payments/index.ts` | CREATE |
| `supabase/functions/bepaid-reconcile-file/index.ts` | EDIT (расширить) |

---

## Важные ограничения

1. **Не ломать существующие связи** — карты-контакты, транзакции-сделки, доступы
2. **DRY-RUN обязателен** — перед любыми массовыми изменениями
3. **Проверка других доступов** — перед отзывом убедиться, что нет валидных оснований
4. **Часовой пояс** — хранение в UTC, отображение по выбору
5. **Пруфы из 1@ajoure.by** — все скрины и audit_logs
