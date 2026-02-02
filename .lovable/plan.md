
# План: Стабилизация импорта CSV bePaid

## Цель
Обеспечить стабильный импорт выписок bePaid с немедленным обновлением UI без F5, корректными периодами в TZ Europe/Minsk, поддержкой multi-file импорта и сверкой с Totals CSV.

---

## PATCH-1: Исправление UI cache после импорта

### Проблема
После успешного execute таблица и stat-карточки не обновляются без F5. Причины:
- `refetchQueries` вызывается, но модалка закрывается через `setTimeout` до завершения refetch
- Смешение predicate и фиксированных queryKey может создавать несогласованность

### Решение
**Файл:** `src/components/admin/payments/BepaidStatementImportDialog.tsx` (строки 194-217)

```typescript
// После execute:
if (result.success) {
  toast({...});
  
  // Единый predicate для ВСЕХ bepaid-statement* queries
  const predicate = (query: { queryKey: readonly unknown[] }) => {
    const key = String(query.queryKey?.[0] ?? '');
    return key.startsWith('bepaid-statement');
  };
  
  // 1. Invalidate все связанные queries
  queryClient.invalidateQueries({ predicate });
  
  // 2. Remove paginated queries (сброс курсора infiniteQuery)
  queryClient.removeQueries({ predicate });
  
  // 3. Refetch все активные queries И ДОЖДАТЬСЯ завершения
  await queryClient.refetchQueries({ predicate, type: 'all' });
  
  // 4. Закрыть модалку ТОЛЬКО после refetch
  handleClose();
}
```

**Ключевые изменения:**
- Убрать `setTimeout` — закрывать сразу после `await refetchQueries`
- Использовать `type: 'all'` вместо `type: 'active'` для гарантированного обновления stats
- Использовать единый predicate везде (без отдельного `queryKey: ['bepaid-statement-paginated']`)

---

## PATCH-2: Инициализация периода в Minsk TZ

### Проблема
В `BepaidStatementTabContent.tsx` период инициализируется через `new Date()` без учёта TZ:
```typescript
const now = new Date();
const [dateFilter, setDateFilter] = useState<DateFilter>({
  from: format(startOfMonth(now), 'yyyy-MM-dd'),
  to: format(endOfMonth(now), 'yyyy-MM-dd'),
});
```

Это может давать неправильные границы месяца если браузер не в Europe/Minsk.

### Решение
**Файл:** `src/components/admin/payments/BepaidStatementTabContent.tsx` (строки 11, 27-32)

```typescript
import { toZonedTime } from 'date-fns-tz';

const MINSK_TZ = 'Europe/Minsk';

// Внутри компонента:
const nowMinsk = toZonedTime(new Date(), MINSK_TZ);
const [dateFilter, setDateFilter] = useState<DateFilter>({
  from: format(startOfMonth(nowMinsk), 'yyyy-MM-dd'),
  to: format(endOfMonth(nowMinsk), 'yyyy-MM-dd'),
});
```

---

## PATCH-3: Multi-file import (3+ CSV за один запуск)

### Текущее состояние
Диалог принимает только один файл: `<Input type="file" accept=".csv" />`

### Решение
**Файл:** `src/components/admin/payments/BepaidStatementImportDialog.tsx`

Изменить на multi-file:

```typescript
// State:
const [files, setFiles] = useState<File[]>([]);
const [csvTexts, setCsvTexts] = useState<Array<{ name: string; text: string }>>([]);

// Input:
<Input
  type="file"
  accept=".csv"
  multiple  // ← Добавить
  onChange={handleFilesChange}
  disabled={isLoading}
/>

// Handler:
const handleFilesChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const selectedFiles = Array.from(e.target.files || []);
  if (selectedFiles.length === 0) return;
  
  // Проверка размера каждого файла
  for (const file of selectedFiles) {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      setParseError(`Файл ${file.name} слишком большой...`);
      return;
    }
  }
  
  setFiles(selectedFiles);
  setParseStatus('reading');
  
  // Прочитать все файлы
  const texts: Array<{ name: string; text: string }> = [];
  for (const file of selectedFiles) {
    const text = await file.text();
    texts.push({ name: file.name, text });
  }
  
  setCsvTexts(texts);
  setParseStatus('ready');
}, []);
```

### Edge Function изменения
**Файл:** `supabase/functions/admin-import-bepaid-statement-csv/index.ts`

Добавить поддержку массива CSV:

```typescript
// Request body:
const { dry_run = true, csv_texts, source = 'bepaid_csv', limit = 5000 } = body;
// csv_texts: Array<{ name: string; text: string }>

// Парсить каждый файл, агрегировать результаты
const fileResults = [];
for (const csvFile of csv_texts) {
  const result = parseCSV(csvFile.text, limit);
  fileResults.push({ name: csvFile.name, ...result });
}

// Объединить все validRows, дедуплицировать по UID
const allValidRows = fileResults.flatMap(f => f.validRows);
// ... дедупликация ...

// Вернуть per-file и агрегированную статистику
return {
  stats: {
    total_files: csv_texts.length,
    per_file: fileResults.map(f => ({ name: f.name, total_rows: f.total_rows, valid_rows: f.valid_rows })),
    total_rows_combined: ...,
    valid_rows_unique: ...,
    duplicates_merged: ...,
  }
};
```

---

## PATCH-4: Totals CSV сверка

### Логика
Totals CSV используется только для контроля, не пишет строки в БД.

**Определение Totals CSV:**
- Имя файла содержит "total" или "итог" (case-insensitive)
- ИЛИ заголовки содержат "Итого", "Total amount", "Expected count"

**UI интерфейс:**

```typescript
interface TotalsExpected {
  expected_count?: number;
  expected_amount?: number;
}

// В отчёте:
{totalsExpected && (
  <div className="mt-3 p-3 border rounded-lg bg-blue-500/10 border-blue-500/20">
    <p className="text-sm font-medium mb-2">Сверка с Totals:</p>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div>Ожидалось транзакций: <span className="font-medium">{totalsExpected.expected_count}</span></div>
      <div>Импортировано: <span className="font-medium">{stats.valid_rows_unique}</span></div>
      <div>Ожидаемая сумма: <span className="font-medium">{totalsExpected.expected_amount}</span></div>
      <div>Фактическая сумма: <span className="font-medium">{stats.total_amount}</span></div>
    </div>
    {hasDelta && (
      <div className="mt-2 text-amber-500 text-xs">
        ⚠️ Расхождение: {delta} транзакций 
        ({stats.duplicates_merged} дубликатов, {stats.invalid_rows} невалидных)
      </div>
    )}
  </div>
)}
```

---

## PATCH-5: Расширенный отчёт импорта

### Текущий ответ Edge Function:
```json
{
  "upserted": 798,
  "errors": 0,
  "stats": {
    "total_rows": 800,
    "valid_rows": 800,
    "invalid_rows": 0,
    "duplicates_merged": 2
  }
}
```

### Расширить ответ:
```json
{
  "stats": {
    "total_files": 2,
    "total_rows": 800,
    "valid_rows": 798,
    "invalid_rows": 2,
    "uids_unique": 798,
    "duplicates_merged": 2,
    "sample_errors": [
      { "row": 45, "file": "erip.csv", "reason": "Missing UID" }
    ]
  },
  "upserted": 798,
  "errors": 0
}
```

### UI отчёт:
```text
Файлы загружены:
  • cards.csv — 500 строк
  • erip.csv — 300 строк
  
Итого: 800 строк → 798 уникальных UID

Импортировано: 798
Дубликатов объединено: 2
Невалидных строк: 2

Примеры ошибок:
  Строка 45 (erip.csv): Missing UID
```

---

## Изменяемые файлы

| Файл | PATCH | Описание изменений |
|------|-------|-------------------|
| `src/components/admin/payments/BepaidStatementImportDialog.tsx` | 1,3,4,5 | Multi-file, cache refresh, Totals сверка, отчёт |
| `src/components/admin/payments/BepaidStatementTabContent.tsx` | 2 | Инициализация периода в Minsk TZ |
| `supabase/functions/admin-import-bepaid-statement-csv/index.ts` | 3,4,5 | Multi-file parsing, Totals detection, extended stats |

---

## Технические детали

### Query cache refresh последовательность

```text
1. invalidateQueries({ predicate }) 
   → Помечает все bepaid-statement* как stale

2. removeQueries({ predicate })
   → Удаляет кэш пагинации, сбрасывает cursor

3. await refetchQueries({ predicate, type: 'all' })
   → Запускает новый fetch для stats и первой страницы списка
   → ЖДЁМ завершения перед закрытием модалки
   
4. handleClose()
   → Закрываем ПОСЛЕ обновления данных
```

### Multi-file merge логика

```text
1. Parse each CSV separately
2. Collect all valid rows with file source tag
3. Deduplicate by UID (last-win merge strategy)
4. Track duplicates_merged = original_valid_count - unique_count
5. Return per-file stats + aggregate stats
```

### Totals CSV detection

```text
Function isTotalsFile(name, headers):
  - name.toLowerCase() contains 'total' or 'итог' → true
  - headers contain 'итого' or 'expected' → true
  - else → false

If Totals CSV detected:
  - Parse expected_count from "Количество" / "Count" column
  - Parse expected_amount from "Сумма" / "Amount" column
  - Return as separate totals_expected object
  - Do NOT include in upsert batch
```

---

## DoD-пруфы (обязательные)

### DoD-1: Toast без undefined
```text
Скрин toast: "Импортировано: 798, ошибок: 0"
```

### DoD-2: UI обновляется без F5
```text
После закрытия диалога:
- Таблица показывает новые строки
- Stat-карточки обновлены
- Скрин Network: виден запрос bepaid_statement_rows ПОСЛЕ close dialog
```

### DoD-3: Период "Февраль" работает
```text
Network proof:
Request URL содержит:
  sort_ts=gte.2026-02-01T00:00:00+03:00
  sort_ts=lte.2026-02-28T23:59:59+03:00
```

### DoD-4: Multi-file import
```text
Скрин: диалог показывает 3 загруженных файла
Скрин: отчёт с per-file breakdown
```

### DoD-5: Totals сверка
```text
Скрин: блок "Сверка с Totals" показывает:
- Ожидалось: 800
- Импортировано: 798
- Расхождение: 2 (2 дубликата)
```

### DoD-6: SYSTEM ACTOR audit_logs
```sql
SELECT action, actor_type, actor_label, meta->>'build_id', created_at
FROM audit_logs
WHERE action LIKE 'bepaid_csv_import.%'
ORDER BY created_at DESC
LIMIT 5;
-- Ожидание: actor_type='system', meta содержит per_file stats
```
