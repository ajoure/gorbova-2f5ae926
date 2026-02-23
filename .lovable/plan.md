
# Исправление всплывающей панели форматирования

## Проблема

Всплывающий тулбар (`FloatingToolbar`) не появляется при выделении текста в полях `RichTextarea`. Также в чек-листе заголовок, описание и название группы остались обычными `Input` без поддержки форматирования.

## Корневые причины

### 1. Заголовок, описание и группа чек-листа -- обычные Input
В `ChecklistBlock.tsx` строки 93-106 и 113-117: поля `title`, `description`, `group.title` используют `Input`, а не `RichTextarea`. Они не имеют атрибута `data-rich-editable`, поэтому тулбар их игнорирует.

### 2. FloatingToolbar не появляется даже для RichTextarea
Тулбар слушает `selectionchange` и ищет `data-rich-editable` элемент через `sel.anchorNode.parentNode` вверх по DOM. Проблема в том, что `anchorNode` -- текстовый узел внутри contentEditable div, и обход `parentNode` должен работать. Однако есть подозрение, что таймаут 150мс или условие `sel.isCollapsed` могут мешать. Нужно добавить отладочные логи и убедиться что обход DOM правильный.

Дополнительно: событие `mouseup` более надёжно для определения момента завершения выделения, чем `selectionchange` с таймаутом. Добавим `mouseup` listener как резервный механизм.

## Решение

### Файл 1: `src/components/ui/FloatingToolbar.tsx`

Добавить дополнительный listener на `mouseup` для более надёжного обнаружения выделения. `selectionchange` с таймаутом может не срабатывать во всех браузерах.

```typescript
// Добавить mouseup listener рядом с selectionchange
useEffect(() => {
  const onSelectionChange = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(updatePosition, 150);
  };

  const onMouseUp = () => {
    setTimeout(updatePosition, 10);
  };

  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mouseup", onMouseUp);

  return () => {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("mouseup", onMouseUp);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
  };
}, [updatePosition]);
```

### Файл 2: `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx`

Заменить `Input` на `RichTextarea inline` для:
- `content.title` (строка 93-97)
- `content.description` (строка 101-105)
- `group.title` (строка 113-118)

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/ui/FloatingToolbar.tsx` | Добавить mouseup listener для надёжного обнаружения выделения |
| `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx` | Заменить 3 поля Input на RichTextarea inline (title, description, group.title) |

## Что НЕ трогаем

- RichTextarea.tsx -- без изменений
- Студенческий вид чек-листа -- без изменений
- Другие блоки -- без изменений
- БД -- без изменений
