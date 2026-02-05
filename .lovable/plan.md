
# План: Исправление навигации по хлебным крошкам, удаление дублирующего меню и стандартизация кнопок

## Проблема 1: 404 при переходе по хлебным крошкам

**Причина**: В файле `AdminLessonProgress.tsx` хлебные крошки и кнопки "Назад" ведут на несуществующий маршрут `/admin/training-lessons/${moduleId}`.

**Правильный маршрут**: `/admin/training-modules/${moduleId}/lessons`

### Затрагиваемые файлы и изменения:

**`src/pages/admin/AdminLessonProgress.tsx`**:
- Строка 120: Изменить `navigate(\`/admin/training-lessons/${moduleId}\`)` → `navigate(\`/admin/training-modules/${moduleId}/lessons\`)`
- Строка 139: Изменить `to={\`/admin/training-lessons/${moduleId}\`}` → `to={\`/admin/training-modules/${moduleId}/lessons\`}`
- Строка 159: Изменить `navigate(\`/admin/training-lessons/${moduleId}\`)` → `navigate(\`/admin/training-modules/${moduleId}/lessons\`)`

---

## Проблема 2: Удаление пункта меню "Импорт КБ"

**Причина**: Дублирует функционал кнопки "Импорт" на странице "Тренинги" (`/admin/training-modules`).

### Затрагиваемые файлы и изменения:

**`src/hooks/useAdminMenuSettings.tsx`**:
- Удалить строку 115: `{ id: "kb-import", label: "Импорт КБ", path: "/admin/kb-import", icon: "Upload", order: 6, permission: "content.view" },`
- Добавить `"kb-import"` в список `DEPRECATED_ITEM_IDS` (строка 127) для автоочистки из сохранённых настроек

---

## Проблема 3: Стандартизация кнопок в меню "Тренинги"

**Текущее состояние**: Кнопки "Импорт" и "Мастер" имеют `variant="outline"`, а "Добавить" — `variant="default"`.

**Решение**: Сделать все три кнопки одного стиля `variant="outline"` с одинаковым `size="sm"` для визуальной консистентности. Основное действие ("Добавить") останется последним для логического ударения.

### Затрагиваемые файлы и изменения:

**`src/pages/admin/AdminTrainingModules.tsx`**:
- Строка 558: Изменить `variant="default"` → `variant="outline"` для кнопки "Добавить"

---

## Техническая сводка изменений

| Файл | Строки | Изменение |
|------|--------|-----------|
| `AdminLessonProgress.tsx` | 120, 139, 159 | Исправить URL с `training-lessons` на `training-modules/.../lessons` |
| `useAdminMenuSettings.tsx` | 115, 127 | Удалить "kb-import" из меню, добавить в deprecated |
| `AdminTrainingModules.tsx` | 558 | Изменить `variant="default"` → `variant="outline"` |

---

## Ожидаемый результат

1. Переход по хлебным крошкам на странице прогресса учеников корректно возвращает к списку уроков
2. Пункт "Импорт КБ" удалён из бокового меню (функционал доступен через кнопку "Импорт" в тренингах)
3. Все три кнопки действий (Импорт, Мастер, Добавить) имеют единый визуальный стиль

---

## Проверка (DoD)

1. Открыть `/admin/training-modules` → Модули → выбрать модуль → выбрать урок → кнопка "Прогресс"
2. На странице прогресса кликнуть хлебную крошку "Бухгалтерия как бизнес" → должно открыться `/admin/training-modules/{id}/lessons` (не 404)
3. Проверить боковое меню — пункт "Импорт КБ" отсутствует
4. Проверить кнопки на странице тренингов — все одного стиля (outline)
