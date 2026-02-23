
# Исправление отображения HTML-форматирования в режиме просмотра

## Проблема

После перехода всех текстовых полей на `RichTextarea`, содержимое теперь хранится как HTML (например, `<div style="text-align: center;"><b>Текст</b></div>`). Однако в режиме просмотра (студенческий вид) эти поля по-прежнему выводятся через `{value}` — React экранирует HTML и показывает теги как обычный текст.

## Решение

Заменить `{value}` на `<span dangerouslySetInnerHTML={{ __html: value }} />` во всех местах, где поля теперь содержат HTML из RichTextarea.

## Полный список исправлений

### AudioBlock.tsx (строка 121)
- `{content.title}` -> `<span dangerouslySetInnerHTML={{ __html: content.title }} />`

### VideoBlock.tsx (строки 180, 215)
- `{content.title}` -> `<span dangerouslySetInnerHTML={{ __html: content.title }} />` (2 места: Kinescope и iframe fallback)

### VideoUnskippableBlock.tsx (строки 186, 212)
- `{content.title}` -> `<span dangerouslySetInnerHTML={{ __html: content.title }} />` (2 места: completed state и player mode)

### AccordionBlock.tsx (строка 60)
- `{item.title || ...}` -> `<span dangerouslySetInnerHTML={{ __html: item.title || "Секция N" }} />`

### TabsBlock.tsx (строка 67)
- `{tab.title}` -> `<span dangerouslySetInnerHTML={{ __html: tab.title }} />`

### StepsBlock.tsx (строки 64, 101)
- `{step.title || ...}` -> `<span dangerouslySetInnerHTML={{ __html: step.title || "Шаг N" }} />` (2 места: horizontal и vertical)

### TimelineBlock.tsx (строки 69, 73)
- `{item.date}` -> `<span dangerouslySetInnerHTML={{ __html: item.date }} />`
- `{item.title || ...}` -> `<span dangerouslySetInnerHTML={{ __html: item.title || "Шаг N" }} />`

### SpoilerBlock.tsx (строка 37)
- `{content.buttonText || "Показать ответ"}` -> `<span dangerouslySetInnerHTML={{ __html: content.buttonText || "Показать ответ" }} />`

### QuoteBlock.tsx (строки 23, 27, 28)
- `"{content.text}"` -> `<span dangerouslySetInnerHTML={{ __html: content.text }} />`
- `{content.author}` -> `<span dangerouslySetInnerHTML={{ __html: content.author }} />`
- `{content.source}` -> `<span dangerouslySetInnerHTML={{ __html: content.source }} />`

### ButtonBlock.tsx (строка 48)
- `{btn.label || "Ссылка"}` -> `<span dangerouslySetInnerHTML={{ __html: btn.label || "Ссылка" }} />`

### QuizSingleBlock.tsx (строка 153)
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizMultipleBlock.tsx (строка 163)
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizTrueFalseBlock.tsx (строка 123)
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizFillBlankBlock.tsx (строка 238)
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizMatchingBlock.tsx (строка 375)
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizSequenceBlock.tsx (строка 317)
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizHotspotBlock.tsx (строки 262, 315)
- `{area.label}` -> `<span dangerouslySetInnerHTML={{ __html: area.label }} />`
- `{content.explanation}` -> `<span dangerouslySetInnerHTML={{ __html: content.explanation }} />`

### QuizSurveyBlock.tsx (строки 494, 652, 653)
- `{content.title}` -> `<span dangerouslySetInnerHTML={{ __html: content.title }} />`
- `{resultToShow.title}` -> `<span dangerouslySetInnerHTML={{ __html: resultToShow.title }} />`
- `{resultToShow.description}` -> `<span dangerouslySetInnerHTML={{ __html: resultToShow.description }} />`

### DiagnosticTableBlock.tsx (строка 396)
- `{content.title}` -> `<span dangerouslySetInnerHTML={{ __html: content.title }} />`

### SequentialFormBlock.tsx (строки 375, 410)
- `{content.title}` -> `<span dangerouslySetInnerHTML={{ __html: content.title }} />`
- `{currentStep.title}` -> `<span dangerouslySetInnerHTML={{ __html: currentStep.title }} />`

## Затронутые файлы

| Файл | Кол-во замен |
|---|---|
| AudioBlock.tsx | 1 |
| VideoBlock.tsx | 2 |
| VideoUnskippableBlock.tsx | 2 |
| AccordionBlock.tsx | 1 |
| TabsBlock.tsx | 1 |
| StepsBlock.tsx | 2 |
| TimelineBlock.tsx | 2 |
| SpoilerBlock.tsx | 1 |
| QuoteBlock.tsx | 3 |
| ButtonBlock.tsx | 1 |
| QuizSingleBlock.tsx | 1 |
| QuizMultipleBlock.tsx | 1 |
| QuizTrueFalseBlock.tsx | 1 |
| QuizFillBlankBlock.tsx | 1 |
| QuizMatchingBlock.tsx | 1 |
| QuizSequenceBlock.tsx | 1 |
| QuizHotspotBlock.tsx | 2 |
| QuizSurveyBlock.tsx | 3 |
| DiagnosticTableBlock.tsx | 1 |
| SequentialFormBlock.tsx | 2 |

**Итого: 20 файлов, ~30 точечных замен**

## Что НЕ трогаем

- Режим редактирования (isEditing) — без изменений
- FloatingToolbar.tsx — без изменений
- RichTextarea.tsx — без изменений
- БД / миграции — не нужны
- Поля, которые уже используют `dangerouslySetInnerHTML` (TextBlock, ChecklistBlock labels, step descriptions и т.д.) — без изменений
