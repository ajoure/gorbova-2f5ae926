
# Диагностика и исправление: данные таблицы сбрасываются при нажатии "Далее"/"Сохранить"

## Анализ проблемы

Проведено полное исследование кода и данных в БД. Данные клиентов **сохраняются в БД корректно** — таблица `lesson_progress_state` содержит записи с заполненными `pointA_rows`. Проблема возникает на уровне взаимодействия двух слоёв дебаунсинга, которые работают против друг друга.

### Корневая причина: race condition между двумя таймерами дебаунсинга

Цепочка событий при нажатии кнопки "Диагностика завершена":

```text
1. Пользователь вводит данные в последнее поле
   → DiagnosticTableBlock.updateLocalRow()
   → debouncedCommit(rows) — запускает таймер 300ms

2. Пользователь сразу нажимает "Диагностика завершена"
   → DiagnosticTableBlock.flushAndCommit() — сбрасывает таймер, вызывает onRowsChange(rows)
   → onRowsChange() === handleDiagnosticTableUpdate()
   → updateState({ pointA_rows: rows }) — запускает таймер 500ms (#1)

3. Параллельно onComplete() вызывается
   → handleDiagnosticTableComplete()
   → updateState({ pointA_completed: true }) — ПЕРЕЗАПИСЫВАЕТ таймер #1!
     ↑ ПРОБЛЕМА: currentState = pendingStateRef.current но pendingStateRef уже содержит rows
     ↑ НО: updateState берёт pendingStateRef.current который равен {..., pointA_rows: rows}
     ↑ Казалось бы OK... Но markBlockCompleted() тоже вызывает updateState()!

4. markBlockCompleted(blockId) вызывается
   → currentSteps = record?.state_json?.completedSteps || []
   → КРИТИЧЕСКИ: record — это СТАРЫЙ state из React state, ещё не обновлённый!
   → updateState({ completedSteps: [...oldSteps, blockId] })
   → Это ПЕРЕЗАПИСЫВАЕТ pendingStateRef снова, теперь уже используя currentState
     из pendingStateRef, который содержит pointA_completed: true, НО...

5. Таймер из шага 3 срабатывает через 500ms — сохраняет состояние
6. Таймер из шага 4 срабатывает через 500ms — сохраняет ЕЩЁ одно состояние
   → Второй saveState() вызов может перезаписать первый с потерей данных
```

### Проблема 2: Race condition в `markBlockCompleted`

```typescript
// useLessonProgressState.tsx строка 131
const markBlockCompleted = useCallback((blockId: string) => {
  const currentSteps = record?.state_json?.completedSteps || []; // ← ЧИТАЕТ record (stale!)
  if (!currentSteps.includes(blockId)) {
    updateState({
      completedSteps: [...currentSteps, blockId]  // ← НЕ читает pendingStateRef!
    });
  }
}, [record, updateState]);
```

`markBlockCompleted` читает `record.state_json.completedSteps` из React state, который ещё не обновлён (так как `setRecord` асинхронно). Но при этом `updateState` внутри читает `pendingStateRef.current`. Итог: новый вызов `updateState` создаёт `newState` из `pendingStateRef` (правильный) + `completedSteps` (из stale record — может быть правильным), и ПЕРЕЗАПИСЫВАЕТ дебаунс-таймер.

Поскольку два `updateState` вызова происходят почти одновременно, второй отменяет таймер первого. Оба записывают в `pendingStateRef` один за другим. Финальное сохранение — это только последний вызов. Если второй вызов (`markBlockCompleted`) пришёл с состоянием, в котором `pointA_rows` уже присутствует — данные сохранятся. Но в ситуации с быстрым нажатием `flushAndCommit` → `onComplete` данные могут быть потеряны.

### Проблема 3: `flushAndCommit` вызывает `onRowsChange` напрямую, минуя `pendingStateRef`

```typescript
// DiagnosticTableBlock.tsx строка 170-178
const flushAndCommit = useCallback(() => {
  if (saveTimeoutRef.current) {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }
  if (localRowsRef.current.length > 0) {
    onRowsChange?.(localRowsRef.current); // ← Запускает updateState({ pointA_rows })
  }
}, [onRowsChange]);
```

Затем сразу вызывается `onComplete?.()`:
```typescript
// Строка 597-598
flushAndCommit();
onComplete?.();  // ← Запускает updateState({ pointA_completed: true }) НЕМЕДЛЕННО
```

Два `updateState` вызова подряд. Каждый создаёт новый `newState` на основе `pendingStateRef.current`:
- Первый вызов: `pendingStateRef.current = { ...old, pointA_rows: rows }` ✓
- Второй вызов: `pendingStateRef.current = { ...предыдущий pending, pointA_completed: true }` ✓

Но затем `markBlockCompleted` читает `record` (stale), получает старые `completedSteps`, и:
- Третий вызов: `pendingStateRef.current = { ...предыдущий pending, completedSteps: [oldSteps + blockId] }`

Это должно работать... Однако после этого вызывается `goToStep(currentStepIndex + 1, true)`, которая вызывает `updateState({ currentStepIndex: N })` — и снова перезаписывает таймер.

В итоге при быстрых последовательных `updateState` вызовах, каждый создаёт правильный `newState` из `pendingStateRef`, но последний таймер всегда побеждает — и именно его `newState` уходит в БД. Если в `goToStep` → `updateState` передаётся только `{ currentStepIndex }`, то этот вызов прочитает `pendingStateRef.current` (который содержит все предыдущие правильные данные) и добавит к нему `currentStepIndex`. Теоретически всё должно сохраниться.

**Реальная проблема**: при перезагрузке страницы данные восстанавливаются корректно (как показывают данные в БД), но визуально кажется что "сбросились". Это происходит из-за того, что `pointA_completed = true` — таблица рендерится в read-only режиме, и клиенты воспринимают это как "данные потерялись".

### Подтверждение из БД

Запрос к `lesson_progress_state` показал, что у пользователей данные **сохраняются**:
- `pointA_rows` — заполнены корректно
- `pointA_completed: true` — стоит
- `completedSteps` — корректны

То есть данные **не теряются**, они просто отображаются в режиме "завершено" (read-only, без кнопок редактирования, с `opacity-80`). Клиенты путают read-only режим с "данные пропали".

### Дополнительная проблема: кнопка "Редактировать данные" не всегда видна

В `KvestLessonView.tsx` строка 362:
```typescript
onReset: (state?.pointA_completed) ? () => handleDiagnosticTableReset(blockId) : undefined,
```

Кнопка "Редактировать данные" показывается только когда `pointA_completed === true`. Но блок уже в `isCompleted && !isCurrent` → `isReadOnly = true` → `onReset: isReadOnly ? undefined : ...` — то есть кнопка СКРЫВАЕТСЯ! Это баг.

В строке 352-365:
```typescript
case 'diagnostic_table':
  return (
    <div className={isReadOnly ? "opacity-80" : ""}>
      <LessonBlockRenderer 
        ...
        kvestProps={{
          rows: pointARows,
          onRowsChange: isReadOnly ? undefined : handleDiagnosticTableUpdate,
          onComplete: isReadOnly ? undefined : () => handleDiagnosticTableComplete(blockId),
          isCompleted: state?.pointA_completed || false,
          onReset: (state?.pointA_completed) ? () => handleDiagnosticTableReset(blockId) : undefined,
          // ↑ ПРАВИЛЬНО: onReset передаётся даже в isReadOnly режиме
        }}
      />
```

Здесь `onReset` передаётся независимо от `isReadOnly` — это корректно. Но кнопка "Редактировать" ведёт к `handleDiagnosticTableReset`, который делает `updateState({ pointA_completed: false, pointA_rows: [] })` — то есть ОЧИЩАЕТ строки! Пользователи нажимают "Редактировать" и теряют данные.

## Реальные баги

| # | Файл | Строка | Проблема | Критичность |
|---|------|--------|----------|-------------|
| 1 | `KvestLessonView.tsx` | 243-252 | `handleDiagnosticTableReset` очищает `pointA_rows: []` — данные теряются при нажатии "Редактировать" | КРИТИЧНО |
| 2 | `KvestLessonView.tsx` | 354 | `isReadOnly` блока не передаётся в `pointer-events-none` для `diagnostic_table` (в отличие от других блоков) — пользователь думает что может редактировать, но изменения не сохраняются | ВАЖНО |
| 3 | `useLessonProgressState.tsx` | 130-137 | `markBlockCompleted` читает `record.state_json` а не `pendingStateRef` — stale closure на completedSteps | ВАЖНО |

## План исправлений

### Исправление 1 (КРИТИЧНО): `handleDiagnosticTableReset` не должен очищать строки

**Файл**: `src/components/lesson/KvestLessonView.tsx`, строки 243-252

Сейчас:
```typescript
const handleDiagnosticTableReset = useCallback((blockId: string) => {
  updateState({ 
    pointA_completed: false,
    pointA_rows: [],          // ← УДАЛИТЬ ЭТУ СТРОКУ — она стирает данные
    completedSteps: ...
    currentStepIndex: ...
  });
```

После исправления:
```typescript
const handleDiagnosticTableReset = useCallback((blockId: string) => {
  updateState({ 
    pointA_completed: false,
    // pointA_rows: [] — НЕ ОЧИЩАЕМ, данные остаются для редактирования
    completedSteps: (state?.completedSteps || []).filter(id => id !== blockId),
    currentStepIndex: currentStepIndex, // Остаёмся на том же шаге
  });
  toast.success("Вы можете отредактировать данные");
}, [state?.completedSteps, currentStepIndex, updateState]);
```

### Исправление 2 (ВАЖНО): `markBlockCompleted` читает `pendingStateRef` для `completedSteps`

**Файл**: `src/hooks/useLessonProgressState.tsx`, строки 130-137

Сейчас `completedSteps` берётся из `record.state_json` (stale). Нужно брать из `pendingStateRef.current` если он есть:

```typescript
const markBlockCompleted = useCallback((blockId: string) => {
  const currentState = pendingStateRef.current ?? record?.state_json ?? {};
  const currentSteps = currentState.completedSteps || [];
  if (!currentSteps.includes(blockId)) {
    updateState({
      completedSteps: [...currentSteps, blockId]
    });
  }
}, [record, updateState]);
```

### Исправление 3 (ВАЖНО): `diagnostic_table` в read-only режиме должен блокировать взаимодействие

**Файл**: `src/components/lesson/KvestLessonView.tsx`, строка 354

Сейчас:
```typescript
<div className={isReadOnly ? "opacity-80" : ""}>
```

Должно быть (но с исключением для кнопки "Редактировать"):
```typescript
<div className={isReadOnly ? "opacity-80 pointer-events-none" : ""}>
```

Но при этом нужно чтобы кнопка "Редактировать данные" была кликабельна. Решение — убрать `pointer-events-none` с обёртки и передать `isCompleted` корректно через `kvestProps`, чтобы `DiagnosticTableBlock` сам блокировал inputs через `disabled={isCompleted}` (что уже реализовано).

### Исправление 4 (ВАЖНО): `goToStep` в `handleDiagnosticTableReset` должна оставаться на текущем шаге, не откатываться

Сейчас `handleDiagnosticTableReset` устанавливает `currentStepIndex: Math.max(0, currentStepIndex - 1)` — пользователя отбрасывает на шаг назад. Это неправильно: он нажал "Редактировать" и должен остаться на той же таблице (шаг N), а не откатиться на N-1.

## Файлы для изменения

| Файл | Изменений | Строки |
|------|-----------|--------|
| `src/components/lesson/KvestLessonView.tsx` | 2 правки | 243-252, 354 |
| `src/hooks/useLessonProgressState.tsx` | 1 правка | 130-137 |

Никаких миграций БД не требуется — данные уже корректно хранятся.

## Что НЕ меняется

- `DiagnosticTableBlock.tsx` — логика компонента корректна
- `saveState` / `upsert` логика в `useLessonProgressState` — работает правильно
- RLS политики — корректны
- Структура таблицы `lesson_progress_state` — без изменений
