

# Исправление: "Модуль в модуле" — финальный патч

## Статус текущей реализации (что уже сделано)

- `parent_module_id` колонка в БД: ЕСТЬ (подтверждено SQL-запросом)
- `parent_module_id` в типах Supabase (`types.ts`): ЕСТЬ
- `ModuleTreeSelector.tsx`: СОЗДАН и полностью работает (дерево, quick-create, бейдж "Скрыт")
- `ContentCreationWizard.tsx`: ОБНОВЛЁН — шаг "Родитель" добавлен в MODULE flow, `parent_module_id` записывается при insert
- LESSON flow в мастере: уже использует `ModuleTreeSelector` вместо плоского `ModuleSelector`

## Что НЕ доделано (1 дефект)

**`ModuleSelector.tsx` (строка 74)** — всё ещё содержит фильтр `.eq("is_container", false)`. Этот компонент используется в других местах (не в мастере), но фильтр скрывает контейнеры. Нужно убрать.

## План действий

### PATCH 1: Убрать фильтр `is_container=false` в `ModuleSelector.tsx`

**Файл:** `src/components/admin/trainings/ModuleSelector.tsx`
**Строка 74:** удалить `.eq("is_container", false)`

Добавить поле `is_container` в `ModuleOption` и отображать бейдж "Папка" для контейнеров (аналогично `ModuleTreeSelector`).

### PATCH 2: Верификация — скриншоты UI

1. Залогиниться в админку
2. Открыть мастер создания контента (ContentCreationWizard)
3. Выбрать тип "Модуль"
4. На шаге "Родитель" — показать дерево модулей с возможностью выбора родителя
5. Создать вложенный модуль
6. Подтвердить SQL-запросом что `parent_module_id` заполнен

### PATCH 3: SQL-верификация

```sql
SELECT id, title, parent_module_id, menu_section_key 
FROM training_modules 
WHERE parent_module_id IS NOT NULL;
```

## Технические детали

Единственное реальное изменение кода — удаление одной строки фильтра в `ModuleSelector.tsx`. Всё остальное уже реализовано и работает. После этого — полная верификация со скринами.
