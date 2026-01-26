

# PATCH: Исправление UI диалога сверки bePaid

## Выявленные проблемы (по скриншоту)

| Проблема | Текущее | Должно быть |
|----------|---------|-------------|
| Высота секций | `max-h-48` (192px) | `max-h-64` (256px) + ScrollArea |
| Нет итогов | Только 4 категории | Итоговая строка с суммами |
| Mismatch ограничен | Показывает 50 из 299 | Показывать все + пагинация |

---

## Изменения

### 1. Увеличить высоту раскрывающихся секций

**Строки 483, 505, 528:**
```tsx
// БЫЛО:
<div className="max-h-48 overflow-auto rounded-xl ...">

// СТАНЕТ:
<ScrollArea className="h-64">
  <div className="rounded-xl bg-muted/30 p-3 text-xs font-mono space-y-1">
    ...
  </div>
</ScrollArea>
```

### 2. Добавить итоговую строку в таблицу

**После строки 468 (закрытие tbody):**
```tsx
<tfoot className="bg-muted/50 border-t-2 border-border">
  <tr>
    <td className="px-4 py-3 font-bold">ИТОГО после исправлений</td>
    <td className="text-right px-4 py-3 tabular-nums font-bold">
      {result.stats.matched + result.stats.missing_in_db + 
       result.stats.status_mismatches + result.stats.amount_mismatches}
    </td>
    <td className="text-right px-4 py-3 tabular-nums font-bold text-emerald-600">
      {(result.missing.reduce((sum, m) => sum + m.amount, 0) + 
        result.extra.reduce((sum, e) => sum + e.amount, 0))
        .toLocaleString('ru-RU', { minimumFractionDigits: 2 })} BYN
    </td>
    <td className="px-4 py-3"></td>
  </tr>
</tfoot>
```

### 3. Показать сумму Mismatch в таблице

**Строка 454:**
```tsx
// БЫЛО:
<td className="text-right px-4 py-2 tabular-nums">—</td>

// СТАНЕТ (показать сумму, которая будет исправлена):
<td className="text-right px-4 py-2 tabular-nums">
  {result.mismatches.reduce((sum, m) => sum + Math.abs(m.file_amount - m.db_amount), 0)
    .toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
</td>
```

---

## Файлы для изменения

| Файл | Строки | Изменение |
|------|--------|-----------|
| `ReconcileFileDialog.tsx` | 468-469 | Добавить tfoot с итогами |
| `ReconcileFileDialog.tsx` | 454 | Показать сумму Mismatch |
| `ReconcileFileDialog.tsx` | 483, 505, 528 | Заменить `max-h-48` на ScrollArea h-64 |

---

## Результат

После исправления диалог покажет:
- **Итоговая строка:** общее кол-во транзакций и сумма после всех исправлений
- **Полный скрол** в раскрывающихся секциях (256px вместо 192px)
- **Сумма разницы** в строке Mismatch

