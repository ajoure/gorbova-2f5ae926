
# План: Добавление всех настроек мастера в редактирование и создание урока

## Текущая ситуация

### В мастере создания (`UniversalLessonFormFields.tsx`) есть:
- Название урока / номер выпуска
- URL-slug
- Описание
- **Дата выпуска** (календарь)
- **Время выпуска** (input type="time")
- **Часовой пояс** (TimezoneSelector)
- **Ссылка на видео Kinescope**
- Превью урока (загрузка + AI)
- Вопросы (для KB)

### В редактировании урока (`AdminTrainingLessons.tsx`) есть только:
- Название урока
- URL-slug
- Описание
- Превью урока
- Активен/неактивен

### В БД есть, но не редактируются:
- `published_at` — дата/время публикации (timestamptz)
- `completion_mode` — режим завершения (manual, view_all_blocks, watch_video, kvest)
- `require_previous` — требовать прохождения предыдущего урока

## Что нужно добавить

| Поле | Создание | Редактирование |
|------|----------|----------------|
| Дата публикации | ✅ Добавить | ✅ Добавить |
| Время публикации | ✅ Добавить | ✅ Добавить |
| Часовой пояс | ✅ Добавить | ✅ Добавить |
| Видео Kinescope | ✅ Добавить | ✅ Добавить |
| Режим завершения | ✅ Добавить | ✅ Добавить |
| Требовать предыдущий | ✅ Добавить | ✅ Добавить |

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/hooks/useTrainingLessons.tsx` | Расширить `TrainingLessonFormData` новыми полями |
| `src/pages/admin/AdminTrainingLessons.tsx` | Расширить `LessonFormContent` всеми полями из мастера |

## Детальные изменения

### 1. useTrainingLessons.tsx — расширить TrainingLessonFormData

```tsx
export interface TrainingLessonFormData {
  module_id: string;
  title: string;
  slug: string;
  description?: string;
  content?: string;
  content_type?: "video" | "audio" | "article" | "document" | "mixed";
  video_url?: string;
  audio_url?: string;
  thumbnail_url?: string;
  sort_order?: number;
  duration_minutes?: number;
  is_active?: boolean;
  // Новые поля:
  published_at?: string;           // ISO string
  completion_mode?: CompletionMode;
  require_previous?: boolean;
}
```

### 2. AdminTrainingLessons.tsx — расширить форму

Новая структура `LessonFormContent`:

```text
┌─────────────────────────────────────────────────────────┐
│ Редактирование урока                                    │
├─────────────────────────────────────────────────────────┤
│ ── Основное ────────────────────────────────────────── │
│ [Название урока *] [URL-slug *]                        │
│ [Краткое описание                                    ] │
│                                                         │
│ ── Публикация ──────────────────────────────────────── │
│ [Дата] [Время] [Часовой пояс ▼]                        │
│ ℹ️ Урок будет показан со статусом «Скоро» до даты       │
│                                                         │
│ ── Видео ───────────────────────────────────────────── │
│ [🎬 Ссылка на видео Kinescope                        ] │
│                                                         │
│ ── Прохождение ─────────────────────────────────────── │
│ Режим завершения: [Ручная отметка ▼]                   │
│   • Ручная отметка                                     │
│   • Просмотр всех блоков                               │
│   • Просмотр видео                                     │
│   • Прохождение квеста                                 │
│                                                         │
│ ☐ Заблокировать, пока не пройден предыдущий урок       │
│                                                         │
│ ── Превью ──────────────────────────────────────────── │
│ [URL превью] [📤] [✨]                                  │
│ [Thumbnail preview]                                     │
│                                                         │
│ [⚡ Активен]                                            │
│                                                         │
│ ℹ️ Видео, текст добавляются через кнопку «Контент»     │
│                                                         │
│                    [Отмена] [Сохранить]                 │
└─────────────────────────────────────────────────────────┘
```

### 3. Добавить импорты в AdminTrainingLessons.tsx

```tsx
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimezoneSelector } from "@/components/admin/payments/TimezoneSelector";
import { format, parseISO } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";
import { CalendarIcon, Video } from "lucide-react";
import { CompletionMode } from "@/hooks/useTrainingLessons";
```

### 4. Новые поля состояния

В `LessonFormContent` добавить локальное состояние для даты/времени:

```tsx
// Parsed from published_at prop
const [publishDate, setPublishDate] = useState<Date | undefined>();
const [publishTime, setPublishTime] = useState("12:00");
const [publishTimezone, setPublishTimezone] = useState("Europe/Minsk");
```

### 5. Логика работы с published_at

**При открытии редактирования:**
```tsx
// Parse published_at ISO string into separate fields
if (lesson.published_at) {
  const date = parseISO(lesson.published_at);
  // Extract date, time and use stored timezone
  setPublishDate(date);
  setPublishTime(format(date, "HH:mm"));
  // Timezone can be stored in separate field or default to Minsk
}
```

**При сохранении:**
```tsx
// Combine date + time + timezone back to ISO
let publishedAt: string | null = null;
if (publishDate) {
  const [hours, minutes] = publishTime.split(":").map(Number);
  const combined = new Date(publishDate);
  combined.setHours(hours, minutes, 0, 0);
  publishedAt = formatInTimeZone(combined, publishTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
```

### 6. Расширить openEditDialog

```tsx
const openEditDialog = useCallback((lesson: TrainingLesson) => {
  setEditingLesson(lesson);
  
  // Parse published_at
  let parsedDate: Date | undefined;
  let parsedTime = "12:00";
  if (lesson.published_at) {
    try {
      parsedDate = parseISO(lesson.published_at);
      parsedTime = format(parsedDate, "HH:mm");
    } catch {}
  }
  
  setFormData({
    module_id: lesson.module_id,
    title: lesson.title,
    slug: lesson.slug,
    description: lesson.description || "",
    content: lesson.content || "",
    content_type: lesson.content_type,
    video_url: lesson.video_url || "",
    audio_url: lesson.audio_url || "",
    thumbnail_url: lesson.thumbnail_url || "",
    duration_minutes: lesson.duration_minutes || undefined,
    is_active: lesson.is_active,
    // Новые поля:
    published_at: lesson.published_at || undefined,
    completion_mode: lesson.completion_mode || "manual",
    require_previous: lesson.require_previous || false,
  });
  
  // Set separate date/time state for form
  setPublishDate(parsedDate);
  setPublishTime(parsedTime);
}, []);
```

### 7. Расширить handleUpdate

```tsx
const handleUpdate = useCallback(async () => {
  if (!editingLesson || !formData.title || !formData.slug) return;
  
  // Build published_at from date/time/timezone
  let publishedAt: string | null = null;
  if (publishDate) {
    const [hours, minutes] = publishTime.split(":").map(Number);
    const combined = new Date(publishDate);
    combined.setHours(hours, minutes, 0, 0);
    publishedAt = formatInTimeZone(combined, publishTimezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  
  const success = await updateLesson(editingLesson.id, {
    ...formData,
    published_at: publishedAt,
  });
  
  if (success) {
    setEditingLesson(null);
    resetForm();
  }
}, [editingLesson, formData, publishDate, publishTime, publishTimezone, updateLesson, resetForm]);
```

### 8. Режим завершения — варианты

```tsx
const completionModeOptions = [
  { value: "manual", label: "Ручная отметка", description: "Ученик сам отмечает урок пройденным" },
  { value: "view_all_blocks", label: "Просмотр всех блоков", description: "Автоматически при просмотре всех блоков" },
  { value: "watch_video", label: "Просмотр видео", description: "Автоматически при полном просмотре видео" },
  { value: "kvest", label: "Прохождение квеста", description: "Пошаговое прохождение интерактивного урока" },
];
```

## DoD (Definition of Done)

| Проверка | Ожидаемый результат |
|----------|---------------------|
| Редактирование урока | Видны все поля: дата/время публикации, видео, режим завершения, require_previous |
| Создание урока | Те же поля доступны при создании нового урока |
| Изменение даты публикации | Сохраняется в БД как `published_at` с учётом часового пояса |
| Изменение режима завершения | Сохраняется как `completion_mode` |
| Изменение require_previous | Сохраняется как `require_previous` |
| Видео Kinescope | Поле доступно, сохраняется в `video_url` |
