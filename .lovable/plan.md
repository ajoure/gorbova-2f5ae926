

# Мини-редактор текста + загрузка HTML-файлов

## Задача 1: Всплывающая панель форматирования текста

### Что делаем
Создаем переиспользуемый компонент `RichTextarea` — поле ввода с поддержкой форматирования текста. При вводе/выделении текста появляется компактный тулбар с кнопками:
- **Жирный** (B)
- **Курсив** (I)
- **Подчеркнутый** (U)
- **Зачеркнутый** (S)
- **Цвет текста** (палитра из 8-10 цветов)
- **Размер текста** (маленький / обычный / средний / большой)

Компонент заменит обычные `<Textarea>` во всех блоках, где редактируется контент с поддержкой HTML.

### Где применяется
Блоки, в которых контент рендерится через `dangerouslySetInnerHTML` (т.е. поддерживают HTML):
- **TextBlock** — основное текстовое поле
- **AccordionBlock** — контент каждой секции
- **TabsBlock** — контент каждой вкладки
- **SpoilerBlock** — скрытый контент
- **CalloutBlock** — текст выноски
- **TimelineBlock** — описание событий
- **StepsBlock** — описание шагов

### Техническая реализация

**Новый файл:** `src/components/ui/RichTextarea.tsx`

Подход: `contentEditable` div + `document.execCommand` для форматирования + floating toolbar.

```
+------------------------------------------+
| B  I  U  S  | A (цвет) | Aa (размер)    |  <-- тулбар (всегда видим сверху)
+------------------------------------------+
|                                          |
|  [contentEditable div]                   |
|  Введите текст...                        |
|                                          |
+------------------------------------------+
```

Принцип работы:
- `contentEditable="true"` div с минимальной стилизацией
- Тулбар зафиксирован сверху (не floating при выделении — проще и надежнее)
- Форматирование через `document.execCommand('bold')`, `execCommand('italic')` и т.д.
- Цвет текста: execCommand('foreColor', color) + popup с палитрой
- Размер текста: execCommand('fontSize') + dropdown (1-7 уровней)
- `onInput` событие передает `innerHTML` наружу через `onChange`
- Поддержка placeholder через CSS `:empty::before`

Props компонента:
```typescript
interface RichTextareaProps {
  value: string;           // HTML-строка
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;      // default "100px"
}
```

## Задача 2: Загрузка HTML-файла в блок "HTML код"

### Что делаем
В блоке `html_raw` добавляем кнопку "Загрузить .html файл" рядом с кнопкой "Предпросмотр". При клике:
1. Открывается стандартный диалог выбора файла (accept=".html,.htm")
2. Файл читается через `FileReader.readAsText()`
3. Содержимое парсится: если это полный HTML-документ (`<html>...</html>`), извлекается содержимое `<head><style>` + `<body>`, иначе берется как есть
4. Результат вставляется в textarea

### Техническая реализация

**Файл:** `src/components/admin/lesson-editor/blocks/HtmlRawBlock.tsx`

Добавляем:
- Скрытый `<input type="file" accept=".html,.htm">` 
- Кнопку "Загрузить файл" с иконкой `Upload`
- Функцию парсинга: DOMParser для извлечения `<style>` и `<body>` из полного HTML-документа
- Поддержка collapsible-блоков (details/summary) — они работают нативно в HTML, поэтому парсер их не трогает

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/ui/RichTextarea.tsx` | Создать: contentEditable + toolbar |
| `src/components/admin/lesson-editor/blocks/TextBlock.tsx` | Заменить Textarea на RichTextarea |
| `src/components/admin/lesson-editor/blocks/AccordionBlock.tsx` | Заменить Textarea на RichTextarea (поле content) |
| `src/components/admin/lesson-editor/blocks/TabsBlock.tsx` | Заменить Textarea на RichTextarea (поле content) |
| `src/components/admin/lesson-editor/blocks/SpoilerBlock.tsx` | Заменить Textarea на RichTextarea (поле content) |
| `src/components/admin/lesson-editor/blocks/CalloutBlock.tsx` | Заменить Textarea на RichTextarea (поле content) |
| `src/components/admin/lesson-editor/blocks/TimelineBlock.tsx` | Заменить Textarea на RichTextarea (поле description) |
| `src/components/admin/lesson-editor/blocks/StepsBlock.tsx` | Заменить Textarea на RichTextarea (поле description) |
| `src/components/admin/lesson-editor/blocks/HtmlRawBlock.tsx` | Добавить кнопку загрузки .html файла + парсер |

## Что НЕ трогаем
- Миграции БД — не нужны
- Студенческие view — без изменений
- Обычные Input (заголовки, названия) — остаются plain text
- Существующий HTML-рендеринг на стороне студента — без изменений

