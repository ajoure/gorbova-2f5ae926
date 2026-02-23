

# Всплывающая панель форматирования текста

## Проблема

Сейчас каждое поле `RichTextarea` имеет постоянный тулбар сверху (B, I, U, S, цвет, размер, выравнивание). Когда таких полей много (например, в чек-листе по 2 на каждый пункт), интерфейс перегружается повторяющимися панелями.

Пользователь хочет:
- Всплывающую панель форматирования при выделении текста
- Панель должна работать на ВСЕХ текстовых полях конструктора (заголовки, описания, названия)
- Чистый, минималистичный дизайн без постоянных тулбаров

## Решение

### 1. Новый компонент `FloatingToolbar`

Глобальный компонент, который:
- Слушает событие `selectionchange` на document
- Определяет, находится ли выделение внутри `contentEditable` элемента с атрибутом `data-rich-editable`
- Позиционируется над выделенным текстом (`position: fixed`, координаты из `getClientRects()`)
- Содержит компактные кнопки: жирный, курсив, подчеркивание, зачёркивание, цвет, размер, выравнивание
- Скрывается при потере выделения или клике вне

### 2. Переработка `RichTextarea`

- Убрать постоянный тулбар полностью
- Оставить только `contentEditable` div с рамкой и placeholder
- Добавить атрибут `data-rich-editable="true"` на редактируемый div (чтобы FloatingToolbar его распознавал)
- Добавить поддержку режима `inline` (для замены однострочных Input): `minHeight="auto"`, однострочный вид

### 3. Замена Input на RichTextarea в блоках

Все текстовые поля конструктора (кроме URL, файловых путей, технических) заменяются на `RichTextarea` в компактном режиме:

| Блок | Поля для замены Input -> RichTextarea |
|---|---|
| ChecklistBlock | title, description, group.title |
| AccordionBlock | item.title |
| TabsBlock | tab.title |
| StepsBlock | step.title |
| TimelineBlock | event.title, event.date |
| SpoilerBlock | buttonText |
| HeadingBlock | text (заголовок) |
| AudioBlock | title |
| VideoBlock | title |
| ImageBlock | alt |
| ButtonBlock | label |
| QuoteBlock | author, source |
| QuizSingleBlock | question, option labels, explanation |
| QuizMultipleBlock | question, option labels, explanation |
| QuizTrueFalseBlock | question, explanation |
| QuizFillBlankBlock | blank labels |
| QuizHotspotBlock | hotspot labels |
| QuizMatchingBlock | pair labels |
| QuizSequenceBlock | item labels |
| QuizSurveyBlock | option labels, result titles |
| DiagnosticTableBlock | column/row headers |
| RoleDescriptionBlock | role titles |
| SequentialFormBlock | field labels |

**НЕ заменяем:** URL-поля, email, числовые значения, Select/Slider, файловые поля.

### 4. Размещение FloatingToolbar

Компонент монтируется один раз на уровне страницы редактора урока (в `LessonEditor` или layout). Не дублируется для каждого поля.

## Технические детали

### FloatingToolbar (новый файл: `src/components/ui/FloatingToolbar.tsx`)

```text
+--------------------------------------------------+
| Слушает document selectionchange                  |
| Проверяет: selection внутри [data-rich-editable]? |
| Да -> показать тулбар над выделением              |
| Нет -> скрыть                                     |
+--------------------------------------------------+
```

- `position: fixed` с `z-index: 50`
- Координаты из `selection.getRangeAt(0).getBoundingClientRect()`
- Тулбар размещается над выделением (или снизу, если не помещается)
- Анимация появления: `opacity` + `scale` transition
- Кнопки используют `document.execCommand()` как сейчас
- Popover для цвета и размера шрифта

### RichTextarea (модификация)

- Убирается весь блок `<div className="flex items-center gap-0.5 px-2 py-1.5 border-b ...">` (постоянный тулбар)
- Добавляется `data-rich-editable="true"` на contentEditable div
- Новый prop `inline?: boolean` — для однострочных полей (убирает min-height, padding)

### Монтирование FloatingToolbar

В файле `LessonContentEditor.tsx` (или аналогичном layout конструктора) добавляется `<FloatingToolbar />` один раз.

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/ui/FloatingToolbar.tsx` | Новый файл — всплывающая панель |
| `src/components/ui/RichTextarea.tsx` | Убрать постоянный тулбар, добавить data-атрибут и inline режим |
| `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx` | Input -> RichTextarea (title, description, group.title) |
| `src/components/admin/lesson-editor/blocks/AccordionBlock.tsx` | Input -> RichTextarea (item.title) |
| `src/components/admin/lesson-editor/blocks/TabsBlock.tsx` | Input -> RichTextarea (tab.title) |
| `src/components/admin/lesson-editor/blocks/StepsBlock.tsx` | Input -> RichTextarea (step.title) |
| `src/components/admin/lesson-editor/blocks/TimelineBlock.tsx` | Input -> RichTextarea (event title/date) |
| `src/components/admin/lesson-editor/blocks/SpoilerBlock.tsx` | Input -> RichTextarea (buttonText) |
| `src/components/admin/lesson-editor/blocks/HeadingBlock.tsx` | Input -> RichTextarea (text) |
| `src/components/admin/lesson-editor/blocks/AudioBlock.tsx` | Input -> RichTextarea (title) |
| `src/components/admin/lesson-editor/blocks/VideoBlock.tsx` | Input -> RichTextarea (title) |
| `src/components/admin/lesson-editor/blocks/ImageBlock.tsx` | Input -> RichTextarea (alt) |
| `src/components/admin/lesson-editor/blocks/ButtonBlock.tsx` | Input -> RichTextarea (label) |
| `src/components/admin/lesson-editor/blocks/QuoteBlock.tsx` | Input -> RichTextarea (author, source) |
| `src/components/admin/lesson-editor/blocks/QuizSingleBlock.tsx` | Input -> RichTextarea (вопрос, варианты) |
| `src/components/admin/lesson-editor/blocks/QuizMultipleBlock.tsx` | Input -> RichTextarea (вопрос, варианты) |
| `src/components/admin/lesson-editor/blocks/QuizTrueFalseBlock.tsx` | Input -> RichTextarea (вопрос) |
| `src/components/admin/lesson-editor/blocks/QuizFillBlankBlock.tsx` | Input -> RichTextarea (метки) |
| `src/components/admin/lesson-editor/blocks/QuizHotspotBlock.tsx` | Input -> RichTextarea (метки) |
| `src/components/admin/lesson-editor/blocks/QuizMatchingBlock.tsx` | Input -> RichTextarea (метки пар) |
| `src/components/admin/lesson-editor/blocks/QuizSequenceBlock.tsx` | Input -> RichTextarea (метки) |
| `src/components/admin/lesson-editor/blocks/QuizSurveyBlock.tsx` | Input -> RichTextarea (варианты, результаты) |
| `src/components/admin/lesson-editor/blocks/DiagnosticTableBlock.tsx` | Input -> RichTextarea (заголовки) |
| `src/components/admin/lesson-editor/blocks/RoleDescriptionBlock.tsx` | Input -> RichTextarea (названия ролей) |
| `src/components/admin/lesson-editor/blocks/SequentialFormBlock.tsx` | Input -> RichTextarea (метки полей) |
| Layout конструктора | Монтирование `<FloatingToolbar />` |

## Что НЕ трогаем

- Студенческие view всех блоков — без изменений
- URL поля (видео, аудио, изображения, embed, кнопки) — остаются Input
- Числовые и технические поля (slider, select, switch) — без изменений
- БД и миграции — не нужны
- RLS политики — без изменений

