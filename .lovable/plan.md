
# План: Исправление отображения scheduled уроков в LibraryModule

## 🔴 Корневая проблема

Страница `/library/buhgalteriya-kak-biznes` обрабатывается компонентом **`LibraryModule.tsx`**, а не `BusinessTrainingContent.tsx`.

В `LibraryModule.tsx` **отсутствует логика для отображения scheduled уроков**:
- Scheduled урок (с `isScheduled: true`) не отфильтровывается хуком, но UI не обрабатывает этот флаг
- Если все уроки scheduled → `lessons.length > 0`, но `.filter(l => l.is_active)` возвращает пустой массив (дубликат фильтрации)
- Нет бейджа "Скоро" и даты открытия

## ✅ Решение

### PATCH-1: Убрать дублирующий фильтр и добавить UI для scheduled

**Файл:** `src/pages/LibraryModule.tsx`

**Изменения:**

1. **Импортировать недостающие компоненты:**
```typescript
import { Timer } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
```

2. **Убрать дублирующий фильтр `.filter(l => l.is_active)` (строка 219)**  
   Хук `useTrainingLessons` уже фильтрует по `is_active = true`.

3. **Добавить отображение scheduled уроков:**
   - Для уроков с `isScheduled: true`:
     - Показывать бейдж "Скоро" (оранжевый)
     - Показывать дату/время открытия
     - Иконка замка вместо номера
     - Карточка disabled (не кликабельная)

4. **Обновить условие "Уроки пока не добавлены":**
   - Показывать пустое состояние только если `lessons.length === 0`
   - Если есть уроки (даже scheduled) — показывать список

---

## 📋 Изменения в коде

### Строка 219 (убрать фильтр):
**Было:**
```tsx
{lessons.filter(l => l.is_active).map((lesson, index) => {
```

**Станет:**
```tsx
{lessons.map((lesson, index) => {
```

### Строки 223-282 (добавить scheduled UI):
```tsx
{lessons.map((lesson, index) => {
  const config = contentTypeConfig[lesson.content_type];
  const Icon = config.icon;
  const isScheduled = lesson.isScheduled;

  return (
    <Card
      key={lesson.id}
      className={`transition-all group ${
        lesson.is_completed ? "bg-muted/30" : ""
      } ${isScheduled 
        ? "opacity-80 cursor-not-allowed" 
        : "cursor-pointer hover:shadow-md"
      }`}
      onClick={() => !isScheduled && handleLessonClick(lesson)}
    >
      <CardContent className="flex items-center gap-4 p-4">
        {/* Lesson number or lock icon */}
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          isScheduled 
            ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" 
            : "bg-muted"
        }`}>
          {isScheduled ? (
            <Lock className="h-4 w-4" />
          ) : (
            index + 1
          )}
        </div>

        {/* Content type icon */}
        <div className={`shrink-0 ${config.color}`}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Lesson info */}
        <div className="flex-1 min-w-0">
          <h3 className={`font-medium transition-colors ${
            lesson.is_completed ? "text-muted-foreground line-through" : ""
          } ${!isScheduled ? "group-hover:text-primary" : ""}`}>
            {lesson.title}
          </h3>
          {isScheduled && lesson.published_at ? (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Timer className="h-3 w-3" />
              Откроется {format(new Date(lesson.published_at), "d MMMM 'в' HH:mm", { locale: ru })}
            </p>
          ) : lesson.description ? (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {lesson.description}
            </p>
          ) : null}
        </div>

        {/* Scheduled badge */}
        {isScheduled ? (
          <Badge variant="outline" className="shrink-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-500 dark:border-amber-700">
            <Clock className="h-3 w-3 mr-1" />
            Скоро
          </Badge>
        ) : (
          <>
            {/* Duration */}
            {lesson.duration_minutes && (
              <div className="shrink-0 flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{lesson.duration_minutes} мин</span>
              </div>
            )}

            {/* Content type badge */}
            <Badge variant="secondary" className="shrink-0">
              {config.label}
            </Badge>

            {/* Completion checkbox */}
            <div
              className="shrink-0"
              onClick={(e) => handleToggleComplete(lesson, e)}
            >
              <Checkbox
                checked={lesson.is_completed}
                className="h-6 w-6 rounded-full"
              />
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </>
        )}
      </CardContent>
    </Card>
  );
})}
```

---

## 📂 Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/pages/LibraryModule.tsx` | Добавить импорты `Timer`, `format`, `ru`; убрать `.filter(l => l.is_active)`; добавить UI для scheduled |

---

## DoD (Definition of Done)

| Проверка | Критерий |
|----------|----------|
| Scheduled урок виден | Урок с `published_at` в будущем отображается в списке |
| Бейдж "Скоро" | Оранжевый бейдж справа от карточки |
| Дата открытия | Под названием: "Откроется 5 февраля в 18:00" |
| Иконка замка | Вместо номера урока |
| Disabled состояние | Клик на карточку не переходит на урок |
| Прямой URL | Заглушка "Урок ещё не опубликован" (уже работает в LibraryLesson) |
| Обычные уроки | Работают как раньше (кликабельные, checkbox, etc.) |

---

## Тест-кейс

1. Зайти как `gerda_nat@mail.ru` (не админ)
2. Открыть `/library/buhgalteriya-kak-biznes`
3. **Ожидаемый результат:**
   - Урок "Тест: В какой роли вы находитесь сейчас" виден
   - Бейдж "Скоро" справа
   - Под названием: "Откроется 5 февраля в 18:00" (или другая дата)
   - Иконка замка вместо номера "1"
   - Клик на карточку не переходит на урок
