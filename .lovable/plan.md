
# План: Исправление сброса и синхронизации прогресса квеста

## Диагноз

### Проблема 1: Сброс прогресса в админке не работает полностью
Кнопка "Сбросить прогресс" в редакторе блоков (`AdminLessonBlockEditor.tsx`) вызывает только `resetProgress()` из `useLessonProgressState`, который удаляет запись из `lesson_progress_state`. 

Однако ответы на тесты хранятся в **другой таблице** — `user_lesson_progress`. После сброса:
- `lesson_progress_state` удалён (role = undefined)
- `user_lesson_progress` остаётся (savedAnswer.isCompleted = true)
- UI показывает результаты теста, но gate закрыт ("Выберите ответ")

### Проблема 2: Кнопка "Пройти ещё раз" не очищает role в kvest-режиме
При нажатии "Пройти ещё раз" в `QuizSurveyBlock`:
1. Вызывается `onReset()` → `handleQuizReset(blockId)` → удаление из `user_lesson_progress`
2. Но `lesson_progress_state.role` **НЕ очищается**
3. После перепрохождения теста роль не обновляется, если `onRoleSelected` не вызывается повторно

---

## Решение

### PATCH-1: Расширить сброс прогресса в админке

**Файл:** `src/pages/admin/AdminLessonBlockEditor.tsx`

Добавить сброс записей из `user_lesson_progress` вместе с `lesson_progress_state`:

```typescript
// Импорт useUserProgress
import { useUserProgress } from "@/hooks/useUserProgress";

// В компоненте
const { resetLessonProgress } = useUserProgress(lessonId || '');

// Обработчик кнопки
onClick={async () => {
  await resetProgress();          // lesson_progress_state
  await resetLessonProgress();    // user_lesson_progress
  toast.success("Прогресс урока сброшен");
}}
```

### PATCH-2: Очищать role при перепрохождении теста в квест-режиме

**Файл:** `src/components/lesson/KvestLessonView.tsx`

Добавить обработчик `onQuizReset` для `quiz_survey`, который:
1. Очищает `role` из `lesson_progress_state`
2. Убирает блок из `completedSteps`

```typescript
// Новый обработчик
const handleQuizSurveyReset = useCallback((blockId: string) => {
  // Очистить роль и убрать блок из завершённых
  const newCompletedSteps = (state?.completedSteps || []).filter(id => id !== blockId);
  updateState({ 
    role: undefined,
    completedSteps: newCompletedSteps 
  });
}, [state?.completedSteps, updateState]);
```

И передать через kvestProps:
```typescript
case 'quiz_survey':
  return (
    <LessonBlockRenderer 
      {...commonProps}
      kvestProps={{
        onRoleSelected: isReadOnly ? undefined : handleRoleSelected,
        isCompleted: isCompleted,
        onQuizReset: isReadOnly ? undefined : () => handleQuizSurveyReset(blockId), // ← NEW
      }}
    />
  );
```

### PATCH-3: Добавить onQuizReset в kvestProps интерфейс

**Файл:** `src/components/lesson/LessonBlockRenderer.tsx`

```typescript
export interface KvestBlockProps {
  // ... existing
  onQuizReset?: () => void;  // ← NEW: очистка role при перепрохождении теста
}
```

И использовать в рендере `quiz_survey`:
```typescript
case 'quiz_survey':
  return (
    <QuizSurveyBlock 
      ...
      onReset={() => {
        handleQuizReset(block.id);          // Очистить user_lesson_progress
        kvestProps?.onQuizReset?.();        // Очистить role в lesson_progress_state
      }}
    />
  );
```

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/pages/admin/AdminLessonBlockEditor.tsx` | Добавить `useUserProgress` и вызов `resetLessonProgress()` |
| `src/components/lesson/KvestLessonView.tsx` | Добавить `handleQuizSurveyReset`, передать через kvestProps |
| `src/components/lesson/LessonBlockRenderer.tsx` | Добавить `onQuizReset` в интерфейс, использовать при рендере quiz_survey |

---

## Тест-кейсы

### Сброс в админке
1. Админ открывает редактор блоков урока
2. Нажимает "Сбросить прогресс"
3. Открывает урок на сайте
4. **Ожидаемый результат:** Тест начинается с начала (нет сохранённых ответов, нет результатов)

### Перепрохождение теста
1. Пользователь проходит quiz_survey в квесте
2. Видит результат (роль = "Исполнитель")
3. Нажимает "Пройти ещё раз"
4. Заново отвечает на вопросы
5. Нажимает "Узнать результат"
6. **Ожидаемый результат:** 
   - Новая роль сохраняется
   - Gate открывается
   - Кнопка "Дальше" становится активной

### Перезагрузка страницы
1. Пользователь проходит тест, видит результат
2. Перезагружает страницу
3. **Ожидаемый результат:** Результаты теста и роль восстанавливаются, можно идти дальше

---

## DoD (Definition of Done)

| Проверка | Критерий |
|----------|----------|
| Сброс прогресса в админке | Очищает обе таблицы (lesson_progress_state + user_lesson_progress) |
| Квест после сброса | Начинается с шага 1, тест пустой |
| Кнопка "Пройти ещё раз" | Очищает role, позволяет перепройти тест |
| Gate после перепрохождения | Открывается при получении нового результата |
| Сохранение данных | Role и ответы сохраняются корректно после прохождения |

---

## Техническая диаграмма

```text
┌─────────────────────────────────────────────────────────────┐
│                     ТЕКУЩЕЕ СОСТОЯНИЕ                        │
├─────────────────────────────────────────────────────────────┤
│  lesson_progress_state     │    user_lesson_progress        │
│  ─────────────────────     │    ────────────────────         │
│  role: 'executor'          │    response.answers: {...}     │
│  currentStepIndex: 1       │    response.isCompleted: true  │
│  completedSteps: [blockId] │                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                    Кнопка "Сбросить прогресс"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ПОСЛЕ PATCH-1                            │
├─────────────────────────────────────────────────────────────┤
│  lesson_progress_state     │    user_lesson_progress        │
│  ─────────────────────     │    ────────────────────         │
│  (УДАЛЕНО)                 │    (УДАЛЕНО)                   │
└─────────────────────────────────────────────────────────────┘
```
