
# Улучшение визуального дизайна блока "Чек-лист"

## Что делаем

Обновляем только StudentView (студенческий вид) компонента `ChecklistBlock` — делаем его визуально современным, с использованием Card-стиля, как у других интерактивных блоков (StudentNote, DiagnosticTable и т.д.).

## Визуальные изменения

**Общая обертка:**
- Card с `border-primary/20` (как у StudentNoteBlock) для консистентности
- Заголовок с иконкой `ListChecks` (из lucide) + текст + описание
- Статус сохранения (анимированный индикатор "Сохранено")

**Группы:**
- Название группы: uppercase, tracking-wide, с тонкой разделительной линией слева (border-l-2 primary)
- Между группами — увеличенные отступы

**Пункты чек-листа:**
- Каждый пункт в отдельной строке с `rounded-xl` фоном при hover
- Чекбокс увеличен до `h-5 w-5` с primary-цветом
- При отметке: текст становится `text-muted-foreground` + зачеркивание, плюс мягкая зеленая иконка галочки
- Description — под основным текстом, мягким цветом
- Вся строка кликабельная (label)
- Transition анимация при toggle

**Прогресс-бар:**
- Обернут в закругленный блок с фоном `bg-muted/30`
- Показывает процент + фракцию ("5 из 8")
- При 100% — зеленый цвет прогресс-бара и текст "Все выполнено!"

## Затронутые файлы

| Файл | Действие |
|---|---|
| `src/components/admin/lesson-editor/blocks/ChecklistBlock.tsx` | Обновить только `ChecklistStudentView` — стили и разметка |

Админский редактор (ChecklistEditor) — без изменений.

## Технические детали

Изменения в файле `ChecklistBlock.tsx`:

1. Добавить импорты: `Card, CardContent` из `@/components/ui/card`, иконки `ListChecks, Check, Loader2` из lucide
2. Добавить состояние `saveStatus` для отображения статуса сохранения (idle/saving/saved)
3. Обновить JSX `ChecklistStudentView`:
   - Обертка: `<Card className="border-primary/20">`
   - Header: иконка ListChecks + заголовок + описание + статус сохранения
   - Группы: `border-l-2 border-primary/30 pl-4` для визуальной иерархии
   - Пункты: `p-3 rounded-xl hover:bg-primary/5 transition-all duration-200`
   - Чекбокс: `h-5 w-5` (крупнее)
   - Checked-состояние: `line-through opacity-60` + зеленый check
   - Прогресс-бар внизу в `rounded-xl bg-muted/30 p-3` с условным цветом при 100%
