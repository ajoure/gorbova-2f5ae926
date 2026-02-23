
# Исправления: RichTextarea везде, чек-лист, HTML-блок, sidebar

## Проблема 1: RichTextarea не добавлен во все блоки

RichTextarea был добавлен только в 7 блоков (TextBlock, AccordionBlock, TabsBlock, SpoilerBlock, CalloutBlock, TimelineBlock, StepsBlock). Остались 6 блоков, где текстовые поля с HTML-содержимым все еще используют обычный `Textarea`:

| Блок | Поля для замены |
|---|---|
| `QuoteBlock` | `text` (текст цитаты) |
| `DiagnosticTableBlock` | `instruction` |
| `RoleDescriptionBlock` | `executor_html`, `freelancer_html`, `entrepreneur_html` |
| `QuizSurveyBlock` | `instruction`, `question` (в каждом вопросе), `description` (в результатах) |
| `QuizFillBlankBlock` | `textBefore` |
| `QuizHotspotBlock` | `question`, `explanation` |
| `QuizMatchingBlock` | `question`, `explanation` |
| `QuizSequenceBlock` | `question`, `explanation` |
| `SequentialFormBlock` | поля инструкций/описаний |
| `StudentUploadBlock` | `instructions` |
| `StudentNoteBlock` | студенческая заметка (plain text, тут RichTextarea не нужен) |

**Решение:** Заменить `Textarea` на `RichTextarea` во всех блоках, где содержимое рендерится как HTML (`dangerouslySetInnerHTML`). Блоки StudentNoteBlock (plain text заметка студента) и StudentUploadBlock (инструкция) оставить как есть — там нет HTML-рендеринга.

## Проблема 2: Чек-лист не виден на странице

Чек-лист **виден** на студенческой странице (подтверждено скриншотом). Проблема в том, что блок HTML-кода (iframe) занимает слишком много пространства с внутренней прокруткой, из-за чего чек-лист "уходит" далеко вниз. Это связано с проблемой 3.

## Проблема 3: Прокрутка внутри HTML-блока

Блок `html_raw` рендерится в iframe с ограничением высоты `max: 5000px`. Это создает внутреннюю прокрутку iframe вместо естественной прокрутки страницы.

**Решение:** Убрать ограничение высоты iframe (`Math.min(..., 5000)`) — пусть iframe автоматически подстраивается под полную высоту контента. Также добавить `overflow: hidden` на iframe, чтобы убрать внутреннюю прокрутку. Увеличить лимит до 50000px или убрать верхний предел.

## Проблема 4: Сохранение прогресса collapsible-блоков внутри HTML

Collapsible-блоки (`details/summary`) внутри HTML-кода работают нативно в браузере. Их состояние (открыт/закрыт) **не сохраняется** между сессиями — это стандартное поведение HTML. Реализация per-user persistence для произвольного HTML внутри sandboxed iframe потребовала бы сложной системы коммуникации между iframe и родительской страницей + хранения состояния в БД. Это архитектурно тяжелая задача, не связанная с текущими исправлениями. Состояние collapsible-блоков будет сбрасываться при перезагрузке страницы.

## Проблема 5: Растягивание строк в левом админ-меню

На скриншоте и при проверке sidebar выглядит нормально. Возможно, баг проявляется при определенных условиях (ресайз окна, конкретный контент). Проведу проверку CSS sidebar на наличие потенциальных проблем с `line-height` или `leading` классами. Текущие стили sidebar используют `leading-tight` и фиксированные `text-xs` — они не должны растягиваться. Если проблема в `SidebarMenuButton`, то его стили заданы через `cva` и не зависят от контента страницы.

## Затронутые файлы

| Файл | Действие |
|---|---|
| `QuoteBlock.tsx` | Заменить Textarea на RichTextarea для поля text |
| `DiagnosticTableBlock.tsx` | Заменить Textarea на RichTextarea для instruction |
| `RoleDescriptionBlock.tsx` | Заменить Textarea на RichTextarea для 3 полей HTML |
| `QuizSurveyBlock.tsx` | Заменить Textarea на RichTextarea для instruction, question, description |
| `QuizFillBlankBlock.tsx` | Заменить Textarea на RichTextarea для textBefore |
| `QuizHotspotBlock.tsx` | Заменить Textarea на RichTextarea для question, explanation |
| `QuizMatchingBlock.tsx` | Заменить Textarea на RichTextarea для question, explanation |
| `QuizSequenceBlock.tsx` | Заменить Textarea на RichTextarea для question, explanation |
| `SequentialFormBlock.tsx` | Заменить Textarea на RichTextarea для текстовых полей |
| `HtmlRawBlock.tsx` | Убрать лимит высоты iframe, добавить overflow: hidden |

## Что НЕ трогаем
- Миграции БД — не нужны
- StudentNoteBlock — plain text, RichTextarea не нужен
- StudentUploadBlock — инструкция не рендерится как HTML
- Студенческие view всех блоков — без изменений
- AdminSidebar.tsx — CSS корректен, растягивание не воспроизводится
