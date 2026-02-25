

# План: Добавить кнопку «Ссылка» в FloatingToolbar

## Что нужно сделать

Добавить кнопку с иконкой Link в всплывающую панель форматирования (`FloatingToolbar`). При нажатии — показать inline-поле ввода URL прямо в тулбаре (без `prompt()`), и по Enter/кнопке «OK» обернуть выделенный текст в `<a href="...">`.

## Изменения

**Файл:** `src/components/ui/FloatingToolbar.tsx`

1. Добавить импорт иконки `Link` из `lucide-react`
2. Добавить state `showLinkInput` (boolean) и `linkUrl` (string)
3. Между блоком выравнивания и разделителем (после `Strikethrough`, перед color picker) добавить кнопку «Ссылка» с иконкой `Link`
4. При клике:
   - Сохранить текущее выделение (selection/range) в ref, чтобы не потерять при фокусе на input
   - Показать inline dropdown с полем ввода URL и кнопками «Вставить» / «Убрать ссылку»
5. По нажатию «Вставить» — восстановить selection, вызвать `exec("createLink", url)` — это стандартный `document.execCommand` который оборачивает выделение в `<a>`
6. Кнопка «Убрать ссылку» — `exec("unlink")` для снятия ссылки
7. Увеличить `toolbarWidth` с 320 до ~360 (добавилась одна кнопка)
8. Закрывать `showLinkInput` при закрытии других подменю и при скролле

### Техническая реализация

- `document.execCommand("createLink", false, url)` — оборачивает выделенный текст в `<a href="url">текст</a>`
- `document.execCommand("unlink")` — убирает ссылку
- Selection сохраняется в `useRef<Range | null>` перед открытием input, и восстанавливается перед exec
- Inline input: небольшой dropdown как у цвета/размера, с `<input>` и кнопкой подтверждения

