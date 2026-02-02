
# План: Исправить импорт выписки bePaid — ошибка дубликатов UID

## ДИАГНОСТИКА

### Корневая причина
**Ошибка PostgreSQL**:
```
ON CONFLICT DO UPDATE command cannot affect row a second time
```

### Объяснение
Excel файл `1-22.xlsx` содержит несколько листов:
- **Лист 1**: Сводка (totals) — не содержит транзакции
- **Лист 2**: ERIP транзакции — ~15 строк с UID
- **Лист 3**: Карточные транзакции — ~15 строк с UID

Текущий код парсит **оба листа** (ERIP + Card) и объединяет их в один массив `allRows[]`. Если одна и та же транзакция присутствует на обоих листах (что бывает при возвратах или смешанных типах), создаются **дубликаты UID**.

При попытке upsert батча из 100 записей с дублирующимися UID, PostgreSQL выбрасывает ошибку — нельзя обновить одну строку дважды в одном запросе.

### Доказательство
- Файл показывает `"Готово к импорту: 30 строк"` — это сумма из двух листов (~15 + ~15)
- Результат: `"Импортировано: 0, ошибок: 30"` — весь батч отклонён
- Console log: `"code": "21000", "message": "ON CONFLICT DO UPDATE command cannot affect row a second time"`

---

## ПЛАН ИЗМЕНЕНИЙ

### PATCH-1 (BLOCKER): Дедупликация UID перед импортом

**Файл:** `src/components/admin/payments/BepaidStatementImportDialog.tsx`

**Изменение — После сбора всех строк (строка ~304), добавить дедупликацию:**

```typescript
// PATCH: Deduplicate rows by UID (keep the last occurrence with most data)
const deduplicatedRows = Array.from(
  allRows.reduce((map, row) => {
    const existing = map.get(row.uid);
    if (!existing) {
      map.set(row.uid, row);
    } else {
      // Merge: keep existing values, overwrite with new non-null values
      const merged = { ...existing };
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== '') {
          merged[key] = value;
        }
      }
      map.set(row.uid, merged);
    }
    return map;
  }, new Map<string, ParsedRow>())
).map(([_, row]) => row);

// Report duplicates found
const duplicatesCount = allRows.length - deduplicatedRows.length;
if (duplicatesCount > 0) {
  console.log(`Deduplicated ${duplicatesCount} rows with same UID`);
}
```

**Изменение — Обновить setParsedRows:**
```typescript
// БЫЛО:
setParsedRows(allRows);

// СТАНЕТ:
setParsedRows(deduplicatedRows);
```

**Изменение — Показать информацию о дубликатах в UI:**
```typescript
{parseStatus === 'ready' && duplicatesCount > 0 && (
  <div className="flex items-center gap-2 text-blue-500">
    <Info className="h-4 w-4" />
    <span>Объединено дубликатов UID: {duplicatesCount}</span>
  </div>
)}
```

---

### PATCH-2 (РЕКОМЕНДАЦИЯ): Улучшить обработку ошибок в useBepaidStatementImport

**Файл:** `src/hooks/useBepaidStatement.ts`

**Изменение — Строки 277-307:**

```typescript
export function useBepaidStatementImport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rows: BepaidStatementInsert[]) => {
      const batchSize = 100;
      let created = 0;
      let errors = 0;
      const errorDetails: string[] = [];
      
      // PATCH: Pre-deduplicate by UID to prevent "affect row second time" error
      const uniqueRows = Array.from(
        rows.reduce((map, row) => {
          map.set(row.uid, row);
          return map;
        }, new Map<string, BepaidStatementInsert>())
      ).map(([_, row]) => row);
      
      const duplicatesSkipped = rows.length - uniqueRows.length;
      if (duplicatesSkipped > 0) {
        console.log(`Import: skipped ${duplicatesSkipped} duplicate UIDs`);
      }
      
      for (let i = 0; i < uniqueRows.length; i += batchSize) {
        const batch = uniqueRows.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('bepaid_statement_rows')
          .upsert(
            batch.map(row => ({
              ...row,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'uid' }
          );
        
        if (error) {
          console.error('Batch upsert error:', error);
          errorDetails.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
          errors += batch.length;
        } else {
          created += batch.length;
        }
      }
      
      return { 
        created, 
        errors, 
        total: uniqueRows.length,
        duplicatesSkipped,
        errorDetails 
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bepaid-statement'] });
      queryClient.invalidateQueries({ queryKey: ['bepaid-statement-stats'] });
    },
  });
}
```

---

### PATCH-3 (РЕКОМЕНДАЦИЯ): Улучшить отображение результатов

**Файл:** `src/components/admin/payments/BepaidStatementImportDialog.tsx`

**Изменение — Показывать детали импорта:**

```typescript
{importResult && (
  <div className="rounded-lg bg-muted/50 p-3 space-y-1">
    <p className="text-sm font-medium">Результат импорта:</p>
    <p className="text-xs text-muted-foreground">
      Импортировано: {importResult.created}, ошибок: {importResult.errors}
    </p>
    {importResult.duplicatesSkipped > 0 && (
      <p className="text-xs text-blue-500">
        Пропущено дубликатов UID: {importResult.duplicatesSkipped}
      </p>
    )}
    {importResult.errors > 0 && importResult.errorDetails?.length > 0 && (
      <div className="mt-2 text-xs text-destructive">
        <p className="font-medium">Ошибки:</p>
        {importResult.errorDetails.slice(0, 3).map((err, i) => (
          <p key={i}>{err}</p>
        ))}
      </div>
    )}
  </div>
)}
```

---

## ПОРЯДОК ВЫПОЛНЕНИЯ

1. **PATCH-1**: Дедупликация UID при парсинге (основной фикс)
2. **PATCH-2**: Защитная дедупликация в mutation + улучшенная обработка ошибок
3. **PATCH-3**: Улучшенный UI для отображения результатов

---

## DoD (обязательные пруфы)

### 1. Импорт файла 1-22.xlsx
- **Было:** `Импортировано: 0, ошибок: 30`
- **Станет:** `Импортировано: ~15-30, ошибок: 0` (точное число зависит от уникальных UID)

### 2. SQL: проверка записей
```sql
SELECT COUNT(*) FROM bepaid_statement_rows 
WHERE created_at_bepaid >= '2026-01-01' 
  AND created_at_bepaid <= '2026-02-03';
-- Ожидание: +15-30 новых записей после импорта
```

### 3. UI скриншот
- Диалог импорта показывает: `Объединено дубликатов UID: N` (если были)
- Результат: `Импортировано: M, ошибок: 0`

---

## Изменяемые файлы

| Файл | Патч | Изменение |
|------|------|-----------|
| `src/components/admin/payments/BepaidStatementImportDialog.tsx` | PATCH-1, PATCH-3 | Дедупликация + UI |
| `src/hooks/useBepaidStatement.ts` | PATCH-2 | Защитная дедупликация в mutation |

---

## Риски

| Риск | Митигация |
|------|-----------|
| Потеря данных при слиянии дубликатов | Merge логика сохраняет все non-null значения из обеих записей |
| Разные данные в ERIP и Card листах | Merge приоритезирует последнее значение, но сохраняет все заполненные поля |

---

## Безопасность

- RLS не меняется (admin-only доступ сохраняется)
- Upsert по UID — идемпотентная операция
- Нет риска создания дубликатов в БД
