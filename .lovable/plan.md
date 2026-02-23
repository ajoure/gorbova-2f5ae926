
# Исправление сохранения прогресса чек-листа

## Корневая причина

`ChecklistStudentView` использует `useState` для инициализации отмеченных пунктов:

```typescript
const initialChecked: string[] = savedResponse?.checkedIds || savedResponse?.checked_ids || [];
const [checked, setChecked] = useState<Set<string>>(new Set(initialChecked));
```

Проблема: `useUserProgress` загружает данные асинхронно. При первом рендере `savedResponse` равен `undefined`, и `useState` инициализирует пустой `Set`. Когда данные загрузятся и `savedResponse` станет доступен, `useState` **не обновляет** состояние — он использует начальное значение только один раз.

Данные в БД **сохраняются корректно** (подтверждено SQL-запросом — записи с `checked_ids` существуют), но при перезагрузке страницы они не восстанавливаются в UI.

## Два типа чек-листов на скриншоте

1. **Верхние чекбоксы** — это HTML-чекбоксы внутри блока `html_raw` (iframe). Они не могут сохранять состояние — это ограничение sandboxed iframe.
2. **Нижний чек-лист "Чек-лист внедрения"** — это блок `ChecklistBlock`, прогресс которого должен сохраняться через `user_lesson_progress`. Именно он сломан из-за описанного бага.

## Решение

### Файл: `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx`

Добавить `useEffect`, который синхронизирует `checked` state с `savedResponse` при его изменении:

```typescript
useEffect(() => {
  const ids: string[] = savedResponse?.checkedIds || savedResponse?.checked_ids || [];
  if (ids.length > 0) {
    setChecked(new Set(ids));
  }
}, [savedResponse]);
```

Это обеспечит:
- При первом рендере (savedResponse = undefined): пустой чек-лист
- Когда данные загрузятся (savedResponse с checked_ids): состояние обновится
- При повторном заходе на страницу: отметки восстановятся

### Импорт

Добавить `useEffect` в импорт из React (сейчас его нет в компоненте).

## Что НЕ трогаем

- Админский редактор (ChecklistEditor) — без изменений
- HTML-блок (html_raw) — чекбоксы внутри iframe не могут сохранять состояние по архитектурным ограничениям
- Таблицу `user_lesson_progress` — данные сохраняются корректно
- Логику `onSave` — работает правильно

## Затронутые файлы

| Файл | Действие |
|---|---|
| `ChecklistBlock.tsx` | Добавить useEffect для синхронизации savedResponse с state |
