
# План исправления: Баг статистики выписки BePaid

## Обнаруженная проблема

### Корневая причина
В SQL-функции `get_bepaid_statement_stats` используется **ILIKE '%успешн%'** для определения успешных платежей:

```sql
WHERE (status ILIKE '%успешн%' OR status ILIKE '%successful%')
```

**Проблема:** Строка **"Неуспешный"** также содержит подстроку "успешн", поэтому попадает в категорию успешных!

### SQL-доказательство
```sql
SELECT 'Неуспешный' ILIKE '%успешн%' as matches;
-- Результат: TRUE (БАГ!)
```

### Фактические данные за февраль
| Status | Transaction Type | Кол-во | Сумма |
|--------|------------------|--------|-------|
| Успешный | Платеж | 70 | 14 514 BYN |
| Неуспешный | Платеж | 36 | 5 657 BYN |
| Успешный | Отмена | 14 | 14 BYN |
| Успешный | Возврат средств | 1 | 195 BYN |

### Что показывается сейчас (НЕПРАВИЛЬНО)
- Платежи: **20 171 BYN / 106 шт** (считает 70 успешных + 36 неуспешных)
- Ошибки: **0 BYN / 0 шт** (не находит "Неуспешный", т.к. ищет "ошибк" или "failed")

### Что должно быть (ПРАВИЛЬНО)
- Платежи: **14 514 BYN / 70 шт** (только успешные платежи)
- Ошибки: **5 657 BYN / 36 шт** (неуспешные платежи)

---

## Решение

### Изменить RPC функцию `get_bepaid_statement_stats`

Заменить нечёткий поиск `ILIKE '%успешн%'` на **точное совпадение** с учётом реальных значений из выписки bePaid.

**Реальные значения в базе:**
- `status`: "Успешный", "Неуспешный"
- `transaction_type`: "Платеж", "Отмена", "Возврат средств"

### Исправленный SQL

```sql
CREATE OR REPLACE FUNCTION public.get_bepaid_statement_stats(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Успешные платежи: status = 'Успешный' И transaction_type = 'Платеж' И amount > 0
    'payments_count', COUNT(*) FILTER (
      WHERE status = 'Успешный'
        AND transaction_type = 'Платеж'
        AND amount > 0
    ),
    'payments_amount', COALESCE(SUM(amount) FILTER (
      WHERE status = 'Успешный'
        AND transaction_type = 'Платеж'
        AND amount > 0
    ), 0),
    
    -- Возвраты: transaction_type = 'Возврат средств'
    'refunds_count', COUNT(*) FILTER (
      WHERE transaction_type = 'Возврат средств'
    ),
    'refunds_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE transaction_type = 'Возврат средств'
    ), 0),
    
    -- Отмены: transaction_type = 'Отмена'
    'cancellations_count', COUNT(*) FILTER (
      WHERE transaction_type = 'Отмена'
    ),
    'cancellations_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE transaction_type = 'Отмена'
    ), 0),
    
    -- Ошибки: status = 'Неуспешный'
    'errors_count', COUNT(*) FILTER (
      WHERE status = 'Неуспешный'
    ),
    'errors_amount', COALESCE(SUM(ABS(amount)) FILTER (
      WHERE status = 'Неуспешный'
    ), 0),
    
    -- Комиссия и перечисления (только по успешным платежам)
    'commission_total', COALESCE(SUM(commission_total) FILTER (
      WHERE status = 'Успешный' AND transaction_type = 'Платеж'
    ), 0),
    'payout_total', COALESCE(SUM(payout_amount) FILTER (
      WHERE status = 'Успешный' AND transaction_type = 'Платеж'
    ), 0),
    
    'total_count', COUNT(*)
  )
  INTO result
  FROM bepaid_statement_rows
  WHERE sort_ts >= from_date 
    AND sort_ts <= to_date;
  
  RETURN result;
END;
$$;
```

### Почему точное совпадение безопасно
Выписка bePaid всегда содержит одни и те же русские значения статусов и типов транзакций. Мы проверили distinct values:
- `status`: только "Успешный" и "Неуспешный"
- `transaction_type`: только "Платеж", "Отмена", "Возврат средств"

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| SQL Migration | Обновить RPC `get_bepaid_statement_stats` — точное совпадение вместо ILIKE |

---

## Ожидаемый результат после исправления

| Метрика | Было (баг) | Станет (правильно) |
|---------|------------|-------------------|
| Платежи | 20 171 BYN / 106 шт | 14 514 BYN / 70 шт |
| Возвраты | 195 BYN / 1 шт | 195 BYN / 1 шт |
| Отмены | 14 BYN / 14 шт | 14 BYN / 14 шт |
| Ошибки | 0 BYN / 0 шт | 5 657 BYN / 36 шт |
| Комиссия | 181.01 BYN | 176.33 BYN (только успешные) |
| Перечислено | 8 458.99 BYN | (пересчитано) |

---

## DoD (Definition of Done)

| Проверка | Ожидаемый результат |
|----------|---------------------|
| "Платежи" карточка | 14 514 BYN / 70 шт |
| "Ошибки" карточка | 5 657 BYN / 36 шт |
| Сумма совпадает с Excel | Копейка в копейку |
| Повторный импорт не ломает | Идемпотентность |
