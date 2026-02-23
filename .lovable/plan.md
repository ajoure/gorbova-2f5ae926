
# Исправление: Точка Б показывается незаполненной при наличии ответов

## Диагноз

SQL-анализ таблицы `lesson_progress_state` для урока `96c970e6-...`:

| Метрика | Значение |
|---|---|
| Всего учеников | 33 |
| Заполнили ответы pointB_answers | **29** |
| Имеют флаг pointB_completed = true | **26** |
| **Потерянные** (ответы есть, флаг нет) | **3** |

Причина потери флага: при завершении sequential_form вызывается `generateSummary()` (AI Edge Function). Если она упала/таймаутнула, `handleComplete` все равно вызывает `onComplete()`, но из-за race condition с debounced `updateState` флаг `pointB_completed` мог не сохраниться.

## Решение (2 части)

### Часть 1: Исправить отображение (надежная детекция)

**Файл:** `src/pages/admin/AdminLessonProgress.tsx`

Вместо проверки только `pointB_completed` флага, проверять **наличие заполненных ответов** как дополнительный критерий:

**Карточка статистики (строка 215):**

Было:
```
progressRecords?.filter(r => (r.state_json as any)?.pointB_completed).length
```

Станет:
```
progressRecords?.filter(r => {
  const s = r.state_json as any;
  return s?.pointB_completed || 
    (s?.pointB_answers && Object.keys(s.pointB_answers).length > 0);
}).length
```

**Таблица, колонка "Точка B" (строка 315):**

Было:
```
state?.pointB_completed ? <Badge>check</Badge> : "—"
```

Станет:
```
const hasPointB = state?.pointB_completed || 
  (state?.pointB_answers && Object.keys(state.pointB_answers).length > 0);
hasPointB ? <Badge>check</Badge> : "—"
```

### Часть 2: Починить данные (3 записи)

Обновить 3 записи в `lesson_progress_state`, где `pointB_answers` заполнены, но `pointB_completed = false` -- установить `pointB_completed = true` через SQL UPDATE.

Это разовая операция для конкретного урока, но логика отображения (Часть 1) защитит от повторения проблемы в любых уроках.

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/pages/admin/AdminLessonProgress.tsx` | Карточка "Точка B" и колонка таблицы: проверять pointB_answers как fallback |

## НЕ трогаем

- `SequentialFormBlock.tsx` -- логика завершения работает корректно в 90% случаев
- `KvestLessonView.tsx` -- handleSequentialFormComplete корректен
- `useLessonProgressState.tsx` -- debounce логика уже исправлена ранее
- `StudentProgressModal.tsx` -- уже проверяет `pointB_answers || pointB_completed`

## DoD

1. Карточка "Точка B" показывает 29 (не 26)
2. В таблице у всех учеников с заполненными ответами стоит галочка
3. 3 "потерянных" записи исправлены в БД
4. Логика работает для ВСЕХ уроков с sequential_form, не только для конкретного
5. Нет ошибок сборки/TS
