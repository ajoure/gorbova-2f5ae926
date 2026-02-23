
# Добавление блоков "HTML-конспект" и "Чек-лист"

## Что делаем

Две новых функции для редактора уроков:

1. **Блок "HTML" (html_raw)** -- позволяет вставить произвольный HTML-код с CSS-стилями. Контент рендерится через iframe (sandbox) для изоляции стилей от основного приложения. В админке -- textarea для вставки HTML, на стороне студента -- отрендеренная страница.

2. **Блок "Чек-лист" (checklist)** -- интерактивный список задач с чекбоксами. Админ создает пункты (заголовок + описание), а студент может отмечать выполненные, прогресс сохраняется. Визуально -- группы пунктов с прогресс-баром.

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/hooks/useLessonBlocks.tsx` | Добавить тип `html_raw` в BlockType union, добавить интерфейсы `HtmlRawContentData` и `ChecklistContentData` |
| `src/components/admin/lesson-editor/blocks/HtmlRawBlock.tsx` | Создать: textarea (editing) + sandboxed iframe (preview/student) |
| `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx` | Создать: редактор пунктов (editing) + интерактивный чек-лист (student) |
| `src/components/admin/lesson-editor/LessonBlockEditor.tsx` | Зарегистрировать оба блока: config, availableBlocks, getDefaultContent, renderBlockContent, import |
| `src/components/lesson/LessonBlockRenderer.tsx` | Добавить case для `html_raw` и `checklist` в renderBlock |
| `src/components/admin/lesson-editor/index.ts` | Добавить экспорты |

## Технические детали

### 1. Типы данных (useLessonBlocks.tsx)

```typescript
// Новый тип в BlockType union
| 'html_raw'

// Интерфейсы
export interface HtmlRawContentData {
  html: string;       // полный HTML-документ (включая <style>)
  title?: string;      // название для админки
}

export interface ChecklistContentData {
  title?: string;
  description?: string;
  groups: {
    id: string;
    title: string;       // "Прямо сейчас", "На этой неделе"
    items: {
      id: string;
      label: string;     // основной текст
      description?: string; // подсказка
    }[];
  }[];
}
```

### 2. HtmlRawBlock.tsx

**Режим редактирования (isEditing=true):**
- Input для названия (опционально)
- Textarea (monospace, min-h-[300px]) для вставки HTML
- Кнопка "Предпросмотр" -- показывает iframe рядом
- Сохранение по onBlur

**Режим просмотра (isEditing=false):**
- Sandboxed iframe: `sandbox="allow-scripts"` (без allow-same-origin для безопасности)
- Высота iframe подстраивается автоматически через postMessage от вложенного скрипта
- HTML оборачивается в полноценный document с `<base target="_blank">` для безопасных ссылок
- Используется `srcdoc` атрибут (не blob URL)

**Безопасность:**
- iframe sandbox без allow-same-origin -- изолирует от родительской страницы
- Ссылки открываются в новой вкладке
- Нет доступа к cookies/storage родителя

### 3. ChecklistBlock.tsx

**Режим редактирования (isEditing=true):**
- Input для заголовка, описание
- Группы: добавить/удалить/переименовать
- Внутри групп: добавить/удалить пункты (label + description)
- Кнопки "+" для добавления

**Режим просмотра (isEditing=false, студент):**
- Заголовок, описание
- Группы пунктов с чекбоксами
- Клик по пункту -- toggle checked
- Прогресс-бар внизу (отмечено X из Y)
- Состояние хранится через `savedResponse` / `onSave` (как StudentNoteBlock) -- массив отмеченных id

### 4. Регистрация в LessonBlockEditor.tsx

- Import `HtmlRawBlock` и `ChecklistBlock`
- В `blockTypeConfig`: `html_raw: { icon: Code, label: "HTML-конспект", color: "bg-indigo-500/10 text-indigo-600", category: 'text' }`
- `checklist` уже есть в config (строка 158), категория 'input' -- оставляем
- В `availableBlocks`: добавить `'html_raw'` и `'checklist'`
- В `getDefaultContent`: case для обоих
- В `renderBlockContent`: case для обоих

### 5. Регистрация в LessonBlockRenderer.tsx

- Import обоих компонентов
- `case 'html_raw'`: рендер с `isEditing={false}`
- `case 'checklist'`: рендер с `isEditing={false}`, плюс `blockId`, `lessonId`, `savedResponse`, `onSave` для сохранения прогресса

### 6. iframe auto-resize (HtmlRawBlock)

В HTML, который вставляется в srcdoc, добавляется скрипт:
```javascript
// Inject at the end of </body>
<script>
  function postHeight() {
    window.parent.postMessage({type:'resize', height: document.body.scrollHeight}, '*');
  }
  window.addEventListener('load', postHeight);
  new ResizeObserver(postHeight).observe(document.body);
</script>
```

React-компонент слушает `message` event и обновляет высоту iframe.

## Что НЕ трогаем

- Миграции БД -- не нужны (content хранится как JSONB)
- Существующие блоки -- без изменений
- Storage bucket -- не нужен
- Edge functions -- не нужны
