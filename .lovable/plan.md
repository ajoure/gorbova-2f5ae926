
# Добавление форматирования в чек-лист + выравнивание текста

## Задача 1: Кнопки выравнивания текста в RichTextarea

Добавить в тулбар `RichTextarea` три кнопки выравнивания:
- По левому краю (`justifyLeft`)
- По центру (`justifyCenter`)
- По правому краю (`justifyRight`)

Используем `document.execCommand("justifyCenter")` и т.д. — аналогично существующим кнопкам форматирования.

Добавляем иконки `AlignLeft`, `AlignCenter`, `AlignRight` из `lucide-react`.

### Файл: `src/components/ui/RichTextarea.tsx`

- Импортировать `AlignLeft`, `AlignCenter`, `AlignRight` из lucide-react
- Добавить разделитель и три кнопки выравнивания после блока размера текста

## Задача 2: RichTextarea в ChecklistBlock

В админском редакторе чек-листа (`ChecklistEditor`) заменить `Input` на `RichTextarea` для полей:
- `item.label` (текст пункта)
- `item.description` (подсказка)

Студенческий вид (`ChecklistStudentView`) — рендерить label и description через `dangerouslySetInnerHTML` вместо обычного текста, чтобы HTML-форматирование отображалось.

### Файл: `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx`

- Импортировать `RichTextarea`
- В `ChecklistEditor`: заменить два `Input` (label, description) на `RichTextarea`
- В `ChecklistStudentView`: заменить `{item.label}` и `{item.description}` на `<span dangerouslySetInnerHTML>` для корректного отображения HTML

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/ui/RichTextarea.tsx` | Добавить 3 кнопки выравнивания (left, center, right) |
| `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx` | Заменить Input на RichTextarea для label и description |

## Что НЕ трогаем
- Остальные блоки — без изменений
- Студенческую логику сохранения прогресса — без изменений
- БД — без изменений
