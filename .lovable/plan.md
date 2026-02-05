
# План: Исправление часового пояса при редактировании уроков и уточнение доступа к "Бухгалтерия как бизнес"

## Проблема 1: Часовой пояс сбивается при редактировании урока

### Диагноз
При открытии формы редактирования урока время парсится неправильно:

```typescript
// Текущий код (строки 400-407 AdminTrainingLessons.tsx)
parsedDate = parseISO(lesson.published_at);  // UTC → локальное время браузера
parsedTime = format(parsedDate, "HH:mm");    // Форматирует в локальном времени браузера
```

**Пример:**
- В БД: `2026-02-05 16:00:00+00` (UTC)
- Это = 19:00 по Минску (UTC+3)
- Но `format()` использует часовой пояс браузера (UTC+1/+2), показывает 17:00 или 18:00
- Пользователь сохраняет → время снова конвертируется → сдвигается на 2 часа

### Решение

**Файл:** `src/pages/admin/AdminTrainingLessons.tsx`

Использовать `formatInTimeZone` для корректного отображения времени в выбранном часовом поясе:

```typescript
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const openEditDialog = useCallback((lesson: TrainingLesson) => {
  setEditingLesson(lesson);
  
  // Parse published_at into separate fields - IN SELECTED TIMEZONE
  let parsedDate: Date | undefined;
  let parsedTime = "12:00";
  const tz = "Europe/Minsk"; // Используем Минск как дефолт
  
  if (lesson.published_at) {
    try {
      const utcDate = parseISO(lesson.published_at);
      parsedDate = utcDate; // Храним UTC дату
      // Форматируем время В ВЫБРАННОМ ЧАСОВОМ ПОЯСЕ
      parsedTime = formatInTimeZone(utcDate, tz, "HH:mm");
    } catch {}
  }
  setPublishDate(parsedDate);
  setPublishTime(parsedTime);
  setPublishTimezone(tz);
  // ...
}, []);
```

---

## Проблема 2: "Бухгалтерия как бизнес" — неправильное сообщение о доступе

### Текущее поведение
- Модуль `buhgalteriya-kak-biznes` отображается во вкладке "Моя библиотека" (потому что `menu_section_key = "products-library"`)
- Для пользователей без доступа показывает общий баннер "Контент доступен участникам тарифов FULL и BUSINESS"
- Но это **неверное сообщение** — "Бухгалтерия как бизнес" это **отдельный продукт**, который:
  - Покупается отдельно (не через тарифы клуба FULL/BUSINESS)
  - Доступен только участникам клуба (на любом тарифе)
  - Покупается на отдельном лендинге

### Бизнес-логика продукта
1. Продукт должен быть виден во **"Все продукты"** (не только в "Моя библиотека")
2. Для пользователей **без доступа** показывать:
   - "Доступен участникам Gorbova Club"
   - "Приобретается отдельно на сайте business-training.gorbova.by"
   - CTA: "Подробнее о тренинге" → ведёт на лендинг
3. Для пользователей **с доступом** — стандартное отображение уроков

### Решение

**PATCH-A:** Изменить `menu_section_key` модуля на `"products"` (чтобы показывался во "Все продукты")

```sql
UPDATE training_modules 
SET menu_section_key = 'products' 
WHERE slug = 'buhgalteriya-kak-biznes';
```

**PATCH-B:** Обновить баннер ограничения в `LibraryModule.tsx`

Добавить специальную обработку для модуля `buhgalteriya-kak-biznes`:

```typescript
// LibraryModule.tsx (строки 180-198)
const isBuhBusiness = moduleSlug === "buhgalteriya-kak-biznes";

{!hasAccess && !modulesLoading && (
  <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/30">
    <CardContent className="py-8 text-center">
      <Lock className="h-12 w-12 mx-auto mb-4 text-amber-600" />
      {isBuhBusiness ? (
        <>
          <h3 className="text-lg font-semibold mb-2 text-amber-900 dark:text-amber-100">
            Доступен участникам Gorbova Club
          </h3>
          <p className="text-amber-700 dark:text-amber-300 mb-4 max-w-md mx-auto">
            Тренинг «Бухгалтерия как бизнес» приобретается отдельно и доступен только участникам клуба на любом тарифе
          </p>
          <Button 
            onClick={() => window.location.href = 'https://business-training.gorbova.by'}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Подробнее о тренинге
          </Button>
        </>
      ) : (
        // Стандартный баннер для других модулей
        <>
          <h3>Контент доступен участникам тарифов FULL и BUSINESS</h3>
          ...
        </>
      )}
    </CardContent>
  </Card>
)}
```

**PATCH-C:** Обновить `ModuleCard.tsx` — специальный бейдж для "Бухгалтерия как бизнес"

```typescript
// ModuleCard.tsx
const isBuhBusiness = module.slug === "buhgalteriya-kak-biznes";

// Вместо "Нет доступа" для buh-business показывать "Для участников клуба"
{!hasAccess && (
  <Badge variant="secondary" className="gap-1 bg-background/80 backdrop-blur-sm">
    <Lock className="h-3 w-3" />
    {isBuhBusiness ? "Для участников клуба" : "Нет доступа"}
  </Badge>
)}
```

---

## Итоговые изменения

| Файл | Изменение |
|------|-----------|
| `src/pages/admin/AdminTrainingLessons.tsx` | Исправить парсинг `published_at` — использовать `formatInTimeZone` |
| `src/pages/LibraryModule.tsx` | Специальный баннер для `buhgalteriya-kak-biznes` |
| `src/components/training/ModuleCard.tsx` | Специальный бейдж для `buhgalteriya-kak-biznes` |
| БД: `training_modules` | Изменить `menu_section_key` на `"products"` |

---

## DoD (тест-кейсы)

### A) Часовой пояс
1. Открыть урок с `published_at = 2026-02-05 19:00 Минск`
2. Форма редактирования должна показывать: Дата=05.02.2026, Время=19:00, Часовой пояс=Минск
3. Сохранить без изменений → время НЕ должно измениться
4. SQL-проверка: `published_at` остаётся `2026-02-05 16:00:00+00`

### B) Доступ к "Бухгалтерия как бизнес" — пользователь без покупки
1. Зайти под пользователем без доступа (не участник клуба или без покупки тренинга)
2. Открыть `/products` → карточка видна с бейджем "Для участников клуба"
3. Кликнуть → открывается модуль с баннером:
   - "Доступен участникам Gorbova Club"
   - "Приобретается отдельно"
   - Кнопка "Подробнее о тренинге" → ведёт на лендинг

### C) Доступ к "Бухгалтерия как бизнес" — пользователь с покупкой
1. Зайти под пользователем с активной подпиской на тренинг
2. Модуль открывается нормально, уроки видны
