
# Отображение дочерних модулей на странице модуля

## Проблема

Модули "1", "1-2", "3" существуют в БД с корректным `parent_module_id = 682d241e-...` (Закрой год). Однако страница `AdminTrainingLessons.tsx` загружает и отображает **только уроки** (`training_lessons`). Дочерние модули (`training_modules` с `parent_module_id = текущий модуль`) нигде не выводятся.

## Решение

Добавить на страницу `AdminTrainingLessons.tsx` секцию "Дочерние модули" — список модулей, у которых `parent_module_id = moduleId`. Каждый дочерний модуль — кликабельная карточка с переходом на его страницу уроков.

## Изменение 1: AdminTrainingLessons.tsx — загрузка дочерних модулей

Добавить `useQuery` для загрузки дочерних модулей:

```typescript
const { data: childModules = [] } = useQuery({
  queryKey: ["child-modules", moduleId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("training_modules")
      .select("id, title, slug, is_active, is_container, sort_order")
      .eq("parent_module_id", moduleId)
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
  enabled: !!moduleId,
});
```

## Изменение 2: AdminTrainingLessons.tsx — отображение дочерних модулей

Между заголовком и списком уроков (строка ~569, перед `{/* Lessons List */}`) добавить секцию:

```
-- Если childModules.length > 0:
  Заголовок "Дочерние модули" (мелкий, text-muted-foreground)
  Список карточек:
    - Иконка Layers
    - Название модуля
    - Badge "Активен" / "Скрыт"
    - Клик -> navigate(`/admin/training-modules/${child.id}/lessons`)
    - Кнопки: Редактировать (карандаш), Удалить (корзина)
```

Кликабельные карточки используют тот же стиль `Card`, что и уроки, но с иконкой `Layers` вместо номера.

## Что НЕ трогаем

- ContentCreationWizard (уже работает корректно с `initialParentModuleId`)
- ModuleTreeSelector
- БД, RLS
- Страницу AdminTrainingModules (корневой список — уже исправлен фильтром)

## DoD

A) На странице "Закрой год" видны дочерние модули "1", "1-2", "3" (или сколько их есть)
B) Клик по дочернему модулю ведёт на его страницу уроков
C) SQL: `SELECT id, title FROM training_modules WHERE parent_module_id = '682d241e-...'` возвращает модули
