
# План исправлений: BLOCKER-пункты финального чек-листа

## Выявленные критические проблемы

| BLOCKER | Проблема | Критичность |
|---------|----------|-------------|
| №1 | Маппинг роли: `QuizSurveyBlock` отправляет `dominantCategories` (массив ['A', 'B', 'C']), но `LessonBlockRenderer` ищет `selectedCategory` | 🔴 КРИТИЧНЫЙ |
| №2 | Kinescope API: нет проверки origin источника postMessage | 🟡 БЕЗОПАСНОСТЬ |
| №3 | Точка A: первая строка не создаётся автоматически — пользователь может не понять | 🟡 UX |
| №4 | Точка B: индикаторы шагов используют `answers[step.id]` (из props), а не `localAnswers` | 🟡 UI-РАССИНХРОН |
| №5 | Kinescope: fallback-таймер не синхронизирован с реальным API | 🟡 ЛОГИКА |

---

## PATCH-A: BLOCKER №1 — Маппинг роли quiz_survey → role

### Текущая проблема

```typescript
// QuizSurveyBlock.tsx:239
onSubmit(
  { answers, isCompleted: true, dominantCategories }, // Массив: ['A'] или ['A', 'B']
  true, ...
);

// LessonBlockRenderer.tsx:93
if (kvestProps?.onRoleSelected && answer?.selectedCategory) { // ❌ Ищет selectedCategory!
  const categoryToRole: Record<string, string> = {
    'A': 'executor', ...
  };
  const role = categoryToRole[answer.selectedCategory as string];
```

### Исправление

**Файл:** `src/components/lesson/LessonBlockRenderer.tsx`

```typescript
// Строки 92-103 — исправить:
if (kvestProps?.onRoleSelected) {
  // dominantCategories — массив категорий, берём первую
  const categories = answer?.dominantCategories as string[] | undefined;
  const primaryCategory = categories?.[0];
  
  if (primaryCategory) {
    const categoryToRole: Record<string, string> = {
      'A': 'executor',
      'А': 'executor',  // Добавить русские буквы
      'B': 'freelancer',
      'Б': 'freelancer',
      'C': 'entrepreneur',
      'В': 'entrepreneur',
    };
    const role = categoryToRole[primaryCategory];
    if (role) {
      kvestProps.onRoleSelected(role);
    }
  }
}
```

---

## PATCH-B: BLOCKER №2 — Kinescope origin check

### Текущая проблема

```typescript
// VideoUnskippableBlock.tsx:116
const handleMessage = (event: MessageEvent) => {
  // ⚠️ Нет проверки origin!
  if (!event.data) return;
```

### Исправление

**Файл:** `src/components/admin/lesson-editor/blocks/VideoUnskippableBlock.tsx`

```typescript
const handleMessage = (event: MessageEvent) => {
  // Проверка origin для Kinescope
  const trustedOrigins = [
    'https://kinescope.io',
    window.location.origin // Для локальной разработки
  ];
  
  if (!trustedOrigins.some(origin => event.origin.startsWith(origin))) {
    return; // Игнорируем сообщения от недоверенных источников
  }
  
  // ... остальной код
};
```

---

## PATCH-C: BLOCKER №4 — Первая строка в Точке A

### Текущее поведение
- Таблица пустая при открытии
- Пользователь должен сам нажать "Добавить строку"
- Это сбивает с толку

### Исправление

**Файл:** `src/components/admin/lesson-editor/blocks/DiagnosticTableBlock.tsx`

```typescript
// Инициализация с первой пустой строкой при отсутствии данных
useEffect(() => {
  // Если нет строк и не completed — создать первую пустую строку
  if (rows.length === 0 && localRows.length === 0 && !isCompleted) {
    const newRow: Record<string, unknown> = { _id: genId() };
    columns.forEach(col => {
      newRow[col.id] = col.type === 'number' ? 0 : col.type === 'slider' ? 5 : '';
    });
    setLocalRows([newRow]);
    onRowsChange?.([newRow]);
  } else if (rows.length > 0 && localRows.length === 0) {
    setLocalRows(rows);
  }
}, [rows, isCompleted]);
```

---

## PATCH-D: BLOCKER №5 — Точка B индикаторы

### Текущая проблема

```typescript
// SequentialFormBlock.tsx:312
${answers[step.id]  // ❌ Использует props, а не localAnswers
  ? 'bg-primary' 
  : idx === currentStepIndex 
    ? 'bg-primary/50' 
    : 'bg-muted'
}
```

### Исправление

```typescript
// Строка 312: заменить answers на localAnswers
${localAnswers[step.id]
  ? 'bg-primary' 
  : idx === currentStepIndex 
    ? 'bg-primary/50' 
    : 'bg-muted'
}
```

---

## PATCH-E: Kinescope fallback-таймер при наличии API

### Текущая проблема
Fallback-таймер стартует по кнопке "Начать просмотр", даже если API работает. Это может вызвать двойной учёт прогресса.

### Исправление

```typescript
// VideoUnskippableBlock.tsx — добавить флаг
const [apiWorking, setApiWorking] = useState(false);

// При получении события от API:
if (data.type === 'player:timeupdate' || data.event === 'timeupdate') {
  setApiWorking(true); // API работает, fallback не нужен
  // ...
}

// В UI: скрыть кнопку fallback если API работает
{!videoStarted && content.duration_seconds && !apiWorking && (
  <div className="absolute inset-0 ...">
    <Button onClick={startFallbackTimer}>Начать просмотр</Button>
  </div>
)}
```

---

## Файлы к изменению

| Файл | PATCH | Изменение |
|------|-------|-----------|
| `LessonBlockRenderer.tsx` | A | Маппинг `dominantCategories` → `role` |
| `VideoUnskippableBlock.tsx` | B, E | Origin check + API/fallback логика |
| `DiagnosticTableBlock.tsx` | C | Автосоздание первой строки |
| `SequentialFormBlock.tsx` | D | Индикаторы на localAnswers |

---

## DoD после исправлений

| BLOCKER | Проверка |
|---------|----------|
| №1 | SQL: `state_json->>'role'` возвращает `executor` / `freelancer` / `entrepreneur` |
| №2 | Kinescope: кнопка активируется по API, fallback только если нет событий |
| №3 | Строгая последовательность: нельзя перейти без завершения текущего |
| №4 | Точка A: первая строка уже есть, итоги считаются |
| №5 | Точка B: 10 шагов, индикаторы корректны |
| №6 | Reload: прогресс восстанавливается |

---

## Безопасность

- Добавляется проверка origin для postMessage
- Никаких изменений RLS/RBAC
- Add-only патчи
