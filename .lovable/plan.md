
# PATCH: Исправление парсера bePaid Excel

## Выявленная проблема

Файл bePaid содержит **2 листа:**

| Лист | Название | Содержимое | Есть UID? |
|------|----------|------------|-----------|
| 1 | Cards | Сводная статистика | **НЕТ** |
| 2 | (без названия или другое) | 640 детальных транзакций | **ДА** |

**Текущий парсер (строки 86-92):**
```javascript
const sheetsToProcess = sheetNames.filter(n => 
  n.toLowerCase().includes('card') || 
  n.toLowerCase().includes('erip') ||
  sheetNames.length === 1
);
```

Проблема: парсер находит лист "Cards" (сводку), не находит там UID, и возвращает 0 транзакций. Второй лист с данными не обрабатывается.

---

## Решение

**Новая логика парсера:**
1. Обработать **ВСЕ листы** в файле
2. На каждом листе искать заголовок с "UID"
3. Если UID найден — парсить транзакции
4. Если не найден — пропустить лист и перейти к следующему
5. Объединить транзакции со всех листов

**Код исправления (строки 84-113):**

```typescript
// Process ALL sheets, not just "Cards"/"ERIP"
for (const sheetName of sheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  // Skip empty sheets
  if (!jsonData || jsonData.length < 2) continue;
  
  // Find header row with UID column (check first 15 rows)
  let headerRowIdx = -1;
  let headers: string[] = [];
  
  for (let i = 0; i < Math.min(15, jsonData.length); i++) {
    const row = jsonData[i];
    if (!row) continue;
    
    // Look for UID column specifically (first column or named UID)
    const rowStr = row.map(c => String(c || '').toLowerCase().trim());
    const hasUid = rowStr.some(h => 
      h === 'uid' || 
      h.includes('id транз') ||
      h.startsWith('uid')
    );
    
    if (hasUid) {
      headerRowIdx = i;
      headers = rowStr;
      break;
    }
  }
  
  // If no UID column found in this sheet, skip it
  if (headerRowIdx === -1) {
    console.log(`Sheet "${sheetName}": no UID column found, skipping`);
    continue;
  }
  
  console.log(`Sheet "${sheetName}": found UID at row ${headerRowIdx}, parsing...`);
  
  // Find column indices
  const uidIdx = headers.findIndex(h => h === 'uid' || h.includes('id транз'));
  // ... rest of parsing logic
}
```

---

## Файл для изменения

| Файл | Строки | Изменение |
|------|--------|-----------|
| `ReconcileFileDialog.tsx` | 84-147 | Переписать `parseExcelFile` с новой логикой |

---

## Ожидаемый результат

После исправления:
1. Загрузка `1-25.xlsx` 
2. Парсер пропускает лист "Cards" (нет UID)
3. Парсер находит лист с транзакциями (есть UID)
4. Toast: **"Найдено 640 транзакций"**

---

## Дополнительные улучшения

1. **Добавить логирование** какие листы обрабатываются
2. **Вывести в UI** название обработанных листов
3. **Валидировать UUID формат** — UID должен быть валидным UUID (8-4-4-4-12)
