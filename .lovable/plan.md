
# План: Единый "Мастер добавления контента" для всех разделов меню

## Текущее состояние

| Компонент | Для KB-разделов | Для остальных разделов |
|-----------|-----------------|------------------------|
| `KbLessonFormFields` | ✅ Используется | ❌ Не используется |
| `LessonFormFieldsSimple` | ❌ Не используется | ✅ Используется |

**Проблема:** `LessonFormFieldsSimple` содержит только:
- Название урока
- URL-slug
- Описание
- Превью

Но **не содержит**: дату выпуска, время, часовой пояс, Kinescope URL, вопросы.

---

## Решение

Создать **универсальный компонент формы урока** `UniversalLessonFormFields`, который:
- Объединяет логику `KbLessonFormFields` и `LessonFormFieldsSimple`
- Динамически показывает поле "Номер выпуска *" ИЛИ "Название урока *" в зависимости от флага `isKbSection`

---

## Технический план

### PATCH-1: Создать `UniversalLessonFormFields.tsx`

**Файл:** `src/components/admin/trainings/UniversalLessonFormFields.tsx`

**Props:**
```typescript
interface UniversalLessonFormFieldsProps {
  isKbSection: boolean;  // true = "Номер выпуска", false = "Название урока"
  lessonData: LessonFormDataSimple;
  kbData: KbLessonFormData;
  onLessonChange: (data: LessonFormDataSimple) => void;
  onKbChange: (data: KbLessonFormData) => void;
}
```

**Логика формы:**
```text
┌────────────────────────────────────────────────────────────┐
│ IF isKbSection:                                           │
│   • Номер выпуска * (обязательный)                        │
│                                                            │
│ ELSE:                                                      │
│   • Название урока * (обязательный)                       │
│   • URL-slug (авто)                                        │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ ОБЩИЕ ПОЛЯ (всегда показываются):                         │
│   • Дата выпуска (Calendar)                               │
│   • Время (HH:mm)                                          │
│   • Часовой пояс (default: Europe/Minsk)                  │
│   • Ссылка на видео (Kinescope)                           │
│   • Превью урока (URL / загрузка / AI генерация)          │
│   • Вопросы к уроку + "Добавить вопрос"                   │
└────────────────────────────────────────────────────────────┘
```

**Дизайн:** Переиспользовать существующий UI из `KbLessonFormFields`:
- Поле даты + времени + таймзоны (как сейчас)
- Kinescope input с иконкой Video
- Thumbnail upload/generate (как сейчас)
- Секция вопросов с прокруткой (как сейчас)

---

### PATCH-2: Обновить `ContentCreationWizard.tsx`

**Изменения:**

1. Заменить импорт:
```typescript
// Было
import { KbLessonFormFields, ... } from "./KbLessonFormFields";
import { LessonFormFieldsSimple, ... } from "./LessonFormFieldsSimple";

// Станет
import { UniversalLessonFormFields } from "./UniversalLessonFormFields";
// Оставить LessonFormFieldsSimple для module flow step 3
```

2. Обновить step 3 в lesson flow (строки 856-917):
```typescript
if (step === 3) {
  // LESSON step - unified form for all sections
  return (
    <div className="space-y-6">
      <UniversalLessonFormFields
        isKbSection={isKbFlow}
        lessonData={wizardData.lesson}
        kbData={wizardData.kbLesson}
        onLessonChange={handleLessonChange}
        onKbChange={handleKbLessonChange}
      />
      
      {/* Telegram notifications */}
      <LessonNotificationConfig ... />
    </div>
  );
}
```

3. Обновить валидацию (строки 282-287):
```typescript
case 3: 
  if (isKbFlow) {
    return wizardData.kbLesson.episode_number > 0;
  }
  // Для не-KB: обязательно название урока
  return !!wizardData.lesson.title && !!wizardData.lesson.slug;
```

4. Обновить логику создания урока `handleCreateStandaloneLessonWithAccess` (строки 432-722):
   - Для не-KB разделов: использовать `wizardData.lesson.title` как название
   - Добавить обработку `published_at` для не-KB разделов (сейчас только для KB)
   - Создавать video block и questions для не-KB разделов (если заполнены)

---

### PATCH-3: Обновить сохранение урока для не-KB разделов

**В `handleCreateStandaloneLessonWithAccess`:**

```typescript
// Build published_at with time and timezone - NOW FOR ALL SECTIONS
let publishedAt: string | null = null;
const answerDate = isKbFlow 
  ? wizardData.kbLesson.answer_date 
  : wizardData.lesson.answer_date;  // Добавить это поле
const answerTime = isKbFlow 
  ? wizardData.kbLesson.answer_time 
  : wizardData.lesson.answer_time;
const answerTz = isKbFlow 
  ? wizardData.kbLesson.answer_timezone 
  : wizardData.lesson.answer_timezone;

if (answerDate) {
  // ... та же логика форматирования
  publishedAt = formatInTimeZone(combinedDate, answerTz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// Create video block if URL provided - NOW FOR ALL SECTIONS
const kinescopeUrl = isKbFlow 
  ? wizardData.kbLesson.kinescope_url 
  : wizardData.lesson.kinescope_url;
if (kinescopeUrl) {
  await supabase.from("lesson_blocks").insert({...});
}

// Create questions - NOW FOR ALL SECTIONS
const questions = isKbFlow 
  ? wizardData.kbLesson.questions 
  : wizardData.lesson.questions;
if (questions?.length > 0) {
  // ... та же логика создания вопросов
}
```

---

### PATCH-4: Расширить `LessonFormDataSimple`

**Файл:** `src/components/admin/trainings/LessonFormFieldsSimple.tsx`

Добавить поля (для совместимости с универсальной формой):
```typescript
export interface LessonFormDataSimple {
  title: string;
  slug: string;
  description?: string;
  thumbnail_url?: string;
  // NEW: для универсального мастера
  answer_date?: Date;
  answer_time?: string;      // "HH:mm"
  answer_timezone?: string;  // IANA, default "Europe/Minsk"
  kinescope_url?: string;
  questions?: Array<{
    question_number: number;
    title: string;
    full_question?: string;
    timecode?: string;
  }>;
}
```

Обновить `createInitialState` в wizard:
```typescript
lesson: {
  title: "",
  slug: "",
  description: "",
  answer_date: undefined,
  answer_time: "00:00",
  answer_timezone: "Europe/Minsk",
  kinescope_url: "",
  questions: [],
},
```

---

## Файлы к созданию/изменению

| Файл | Действие |
|------|----------|
| `src/components/admin/trainings/UniversalLessonFormFields.tsx` | **Создать** |
| `src/components/admin/trainings/LessonFormFieldsSimple.tsx` | Расширить interface |
| `src/components/admin/trainings/ContentCreationWizard.tsx` | Обновить step 3 и логику создания |

---

## Схема работы

```text
Шаг 1: Раздел меню
   ↓
Шаг 2: Тип контента
   ↓
Шаг 3: Доступ
   ↓
Шаг 4: Урок
   ├── isKbSection = true  → "Номер выпуска *"
   └── isKbSection = false → "Название урока *"
   
   + Общие поля:
     • Дата + Время + Таймзона
     • Kinescope URL
     • Превью
     • Вопросы
   ↓
Шаг 5: Готово
```

---

## DoD (Definition of Done)

| # | Проверка | Ожидание |
|---|----------|----------|
| 1 | Открыть мастер из "Обучение / Моя библиотека" | Шаг 4 показывает "Название урока *" |
| 2 | Открыть мастер из "База знаний / Видеоответы" | Шаг 4 показывает "Номер выпуска *" |
| 3 | Заполнить форму в не-KB разделе с видео URL | Урок создаётся с video block |
| 4 | Добавить вопросы в не-KB разделе | Вопросы сохраняются в kb_questions |
| 5 | После F5 в навигации | Урок виден в выбранном разделе |

---

## Безопасность и ограничения

- Никаких изменений RLS/RBAC
- Add-only подход: новый компонент, минимальные изменения в существующих
- Существующий функционал KB-разделов не затрагивается
- Все тексты на русском языке
