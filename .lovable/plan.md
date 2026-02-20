
# Копирование и перемещение модулей/уроков в тренингах

## Что будет сделано

Возможность копировать и перемещать любые модули (целиком, рекурсивно, со всеми уроками и блоками) и уроки в любое место в системе тренингов. При копировании к названию добавляется префикс "Копия — ".

---

## Архитектура

### 1. Edge function: `training-copy-move`

Новый файл: `supabase/functions/training-copy-move/index.ts`

Принимает POST-запрос с телом:

```text
action: "copy_module" | "move_module" | "copy_lesson" | "move_lesson"
source_id: UUID исходного элемента
target_module_id: UUID целевого модуля (или null для корня)
target_section_key: string (menu_section_key целевого раздела)
```

Логика по операциям:

**copy_lesson:**
- SELECT урок по source_id
- INSERT копию с title = "Копия — {title}", новым slug (slug + "-copy" + уникализация), новым id
- SELECT все lesson_blocks по lesson_id = source_id
- INSERT копии блоков с новым lesson_id (с сохранением parent_id дерева блоков -- маппинг старых id на новые)
- SELECT все kb_questions по lesson_id = source_id
- INSERT копии вопросов с новым lesson_id

**copy_module (рекурсивно):**
- SELECT модуль по source_id
- INSERT копию модуля с title = "Копия — {title}", новым slug, target parent_module_id, target menu_section_key
- SELECT module_access по module_id = source_id, INSERT копии для нового модуля
- SELECT все training_lessons по module_id = source_id, для каждого -- copy_lesson (в новый модуль)
- SELECT дочерние модули (parent_module_id = source_id), для каждого -- рекурсивный copy_module (parent = новый модуль)

**move_lesson:**
- UPDATE training_lessons SET module_id = target_module_id WHERE id = source_id

**move_module:**
- UPDATE training_modules SET parent_module_id = target_module_id, menu_section_key = target_section_key WHERE id = source_id

Проверка прав: только admin/superadmin (через JWT + проверку роли в user_roles).

### 2. UI: Диалог `CopyMoveDialog.tsx`

Новый файл: `src/components/admin/trainings/CopyMoveDialog.tsx`

Props:
- `open`, `onOpenChange`
- `sourceType: "module" | "lesson"`
- `sourceId: string`
- `sourceTitle: string`
- `currentSectionKey: string`
- `onSuccess: () => void`

Содержимое:
- Переключатель "Копировать" / "Переместить"
- `ContentSectionSelector` для выбора целевого раздела
- `ModuleTreeSelector` для выбора целевого модуля/папки (mode="select-parent")
- Кнопка подтверждения
- Индикатор загрузки

### 3. Интеграция кнопок в UI

**AdminTrainingLessons.tsx** (строки 708-741, блок Actions для уроков):
- Добавить кнопку "Копировать/Переместить" (иконка `Copy`) рядом с кнопками "Контент", "Редактировать", "Удалить"

**AdminTrainingLessons.tsx** (строки 608-635, блок Actions для дочерних модулей):
- Добавить кнопку "Копировать/Переместить" (иконка `Copy`) рядом с "Редактировать" и "Удалить"

**AdminTrainingModules.tsx** (карточки модулей на главной странице):
- Добавить кнопку "Копировать/Переместить" в контекстное меню или в строку действий

---

## Файлы

| Файл | Действие |
|---|---|
| `supabase/functions/training-copy-move/index.ts` | Создать |
| `src/components/admin/trainings/CopyMoveDialog.tsx` | Создать |
| `src/pages/admin/AdminTrainingLessons.tsx` | Добавить кнопки copy/move для уроков и дочерних модулей |
| `src/pages/admin/AdminTrainingModules.tsx` | Добавить кнопку copy/move для корневых модулей |

---

## Что НЕ трогаем

- Схему БД (все таблицы уже есть)
- RLS политики
- useTrainingModules, useTrainingLessons, useLessonBlocks
- ContentCreationWizard, ModuleTreeSelector

## DoD

A) Кнопка "Копировать" на уроке -> диалог -> выбор целевого модуля -> создаётся полная копия урока со всеми блоками и вопросами
B) Кнопка "Копировать" на модуле -> диалог -> выбор куда -> создаётся полная рекурсивная копия модуля со всеми дочерними модулями, уроками, блоками
C) Кнопка "Переместить" -> обновляет parent_module_id / module_id
D) SQL-пруф: копия имеет новый id, title с "Копия — ", корректный parent
E) Регрессия: существующий контент не затрагивается
