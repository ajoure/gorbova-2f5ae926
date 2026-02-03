

# План: Улучшение работы с уроками в Базе знаний

## Обзор задач

1. **Исправить сортировку уроков (видеоответов)** — новые выпуски вверху, старые внизу
2. **Добавить фильтр-кнопку для сортировки** — переключение от новых к старым / от старых к новым
3. **Исправить нерабочую кнопку "Фильтр по дате"** — в вопросах
4. **Расширить мастер добавления урока** — для Базы знаний с вводом вопросов/ответов как в импорте

---

## Часть 1: Исправление сортировки уроков

### Проблема
Выпуск №101 (созданный сегодня) отображается в конце списка рядом с Выпуском №1, а не в начале. Причина: `sort_order = 100` (такой же как у Выпуска №100), и `published_at = NULL`.

### Текущая логика сортировки в `useContainerLessons.ts`:
```sql
ORDER BY published_at DESC NULLS LAST, sort_order DESC, created_at DESC
```

### Решение
Изменить сортировку: использовать `sort_order DESC` как первичный ключ (номер выпуска = номер сортировки).

Для выпуска №101: нужно установить `sort_order = 101`.

**Файл: `src/hooks/useContainerLessons.ts` (строка 61-63)**

```tsx
// Было:
.order("published_at", { ascending: false, nullsFirst: false })
.order("sort_order", { ascending: false })
.order("created_at", { ascending: false });

// Станет:
.order("sort_order", { ascending: false })
.order("published_at", { ascending: false, nullsFirst: false })
.order("created_at", { ascending: false });
```

Также при создании нового урока через мастер/импорт: автоматически вычислять `sort_order` на основе номера выпуска в названии.

---

## Часть 2: Добавление переключателя сортировки

### Где
Вкладка "Видеоответы" на странице `/knowledge` (компонент `Knowledge.tsx`).

### Реализация

Добавить state `sortOrder: 'newest' | 'oldest'` и UI-переключатель (кнопка или dropdown).

**Изменения в `Knowledge.tsx`:**

1. Добавить состояние:
```tsx
const [videoSortOrder, setVideoSortOrder] = useState<'newest' | 'oldest'>('newest');
```

2. Добавить UI под табами для вкладки видеоответов:
```tsx
{tab.key === "knowledge-videos" && (
  <div className="flex gap-2 items-center">
    <Button 
      variant={videoSortOrder === 'newest' ? 'default' : 'outline'} 
      size="sm"
      onClick={() => setVideoSortOrder('newest')}
    >
      Сначала новые
    </Button>
    <Button 
      variant={videoSortOrder === 'oldest' ? 'default' : 'outline'} 
      size="sm"
      onClick={() => setVideoSortOrder('oldest')}
    >
      Сначала старые
    </Button>
  </div>
)}
```

3. Сортировать `standaloneLessons` на клиенте:
```tsx
const sortedLessons = useMemo(() => {
  if (!standaloneLessons.length) return [];
  return [...standaloneLessons].sort((a, b) => {
    const orderA = a.sort_order ?? 0;
    const orderB = b.sort_order ?? 0;
    return videoSortOrder === 'newest' 
      ? orderB - orderA 
      : orderA - orderB;
  });
}, [standaloneLessons, videoSortOrder]);
```

---

## Часть 3: Фильтр по дате в вопросах

### Проблема
Кнопка "Фильтр по дате" в вопросах (`knowledge-questions`) неактивна — просто декоративная.

### Решение
Добавить dropdown с выбором периода или переключатель сортировки (аналогично видеоответам).

**Изменения в `Knowledge.tsx`:**

1. Добавить state:
```tsx
const [questionSortOrder, setQuestionSortOrder] = useState<'newest' | 'oldest'>('newest');
```

2. Заменить декоративную кнопку на рабочий переключатель:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" className="gap-2">
      <Filter className="h-4 w-4" />
      {questionSortOrder === 'newest' ? 'Сначала новые' : 'Сначала старые'}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => setQuestionSortOrder('newest')}>
      Сначала новые
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setQuestionSortOrder('oldest')}>
      Сначала старые
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

3. Передать `sortOrder` в `QuestionsContent` и применить сортировку.

---

## Часть 4: Расширенный мастер для Базы знаний

### Текущее поведение мастера
Мастер (`ContentCreationWizard`) создаёт:
- **Модуль** (с уроком опционально)
- **Урок** (standalone в контейнере)

Поля: название, slug, описание, превью.

### Требования для Базы знаний
При создании урока в разделе `knowledge-videos`:
1. Добавить поля: **дата выпуска**, **номер выпуска**, **ссылка на Kinescope**
2. Добавить возможность ввода **вопросов** с таймкодами (как в Excel-импорте)
3. Автоматически вычислять `sort_order` из номера выпуска
4. Сохранять вопросы в `kb_questions`

### Реализация

#### A. Расширить `LessonFormDataSimple` (или создать `KbLessonFormData`)

```tsx
interface KbLessonFormData extends LessonFormDataSimple {
  episode_number?: number;
  answer_date?: string;
  kinescope_url?: string;
  questions?: KbQuestionInput[];
}

interface KbQuestionInput {
  question_number: number;
  title: string;           // Суть вопроса
  full_question?: string;  // Полный текст
  timecode_seconds?: number;
}
```

#### B. Создать компонент `KbLessonFormFields`

Поля:
- Номер выпуска (number input)
- Дата ответа (date picker)
- Ссылка на видео Kinescope
- Динамический список вопросов (можно добавлять/удалять)

#### C. Модифицировать логику в `ContentCreationWizard`

При `menuSectionKey === 'knowledge-videos'`:
1. Показывать расширенную форму `KbLessonFormFields` вместо `LessonFormFieldsSimple`
2. После создания урока — сохранять вопросы в `kb_questions`
3. Автоматически создавать блок видео в `lesson_blocks`

#### D. Изменить логику `handleCreateStandaloneLesson`

```tsx
// При создании урока в KB:
const lessonData = {
  module_id: containerId,
  title: `Выпуск №${wizardData.kbLesson.episode_number}`,
  slug: `episode-${wizardData.kbLesson.episode_number}`,
  sort_order: wizardData.kbLesson.episode_number,
  // ...
};

// Создать блок видео
await supabase.from("lesson_blocks").insert({
  lesson_id: newLesson.id,
  type: "video",
  content: {
    url: wizardData.kbLesson.kinescope_url,
    provider: "kinescope",
  },
});

// Сохранить вопросы
for (const q of wizardData.kbLesson.questions) {
  await supabase.from("kb_questions").insert({
    lesson_id: newLesson.id,
    episode_number: wizardData.kbLesson.episode_number,
    question_number: q.question_number,
    title: q.title,
    full_question: q.full_question,
    timecode_seconds: q.timecode_seconds,
    answer_date: wizardData.kbLesson.answer_date,
    kinescope_url: wizardData.kbLesson.kinescope_url,
  });
}
```

---

## Технические изменения

### Файлы для модификации

| Файл | Изменения |
|------|-----------|
| `src/hooks/useContainerLessons.ts` | Изменить порядок сортировки |
| `src/pages/Knowledge.tsx` | Добавить состояние и UI сортировки |
| `src/components/admin/trainings/ContentCreationWizard.tsx` | Расширить логику для KB |
| **НОВЫЙ** `src/components/admin/trainings/KbLessonFormFields.tsx` | Форма для уроков KB |

### Новые компоненты

1. **`KbLessonFormFields.tsx`** — расширенная форма с полями:
   - Номер выпуска
   - Дата ответа  
   - Kinescope URL
   - Список вопросов (динамический)

2. **`KbQuestionInput.tsx`** — компонент ввода одного вопроса:
   - Номер вопроса
   - Суть (title)
   - Полный текст (full_question)
   - Таймкод

---

## Визуальный результат

### Видеоответы с сортировкой:
```
┌─────────────────────────────────────────────────────────────┐
│ Вопросы │ Видеоответы │ Законодательство                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Сначала новые ✓] [Сначала старые]                          │  ← НОВОЕ
│                                                             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                         │
│ │ Вып.101 │ │ Вып.100 │ │ Вып.99  │  ...                    │
│ └─────────┘ └─────────┘ └─────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Мастер для Базы знаний (шаг "Урок"):
```
┌─────────────────────────────────────────────────────────────┐
│  Мастер добавления контента                                 │
├─────────────────────────────────────────────────────────────┤
│  [1] Раздел  [2] Тип  [3] Урок  [4] Вопросы  [5] ✓         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Номер выпуска:  [101_________]                             │
│  Дата ответа:    [03.02.2026__]                             │
│  Kinescope URL:  [https://kinescope.io/xxxxx]               │
│                                                             │
│  ─────────────────────────────────────────────              │
│  Превью:   [📷 Загрузить] [✨ AI]                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                    [Назад] [Далее →]        │
└─────────────────────────────────────────────────────────────┘
```

### Мастер — шаг "Вопросы":
```
┌─────────────────────────────────────────────────────────────┐
│  Вопросы к выпуску №101                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Вопрос 1:                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Суть: [Как рассчитать НДС при импорте?__________]    │   │
│  │ Полный текст: [____________________________...]      │   │
│  │ Таймкод: [01:22____]                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Вопрос 2:                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Суть: [Нужна ли касса для ИП?___________________]    │   │
│  │ ...                                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [+ Добавить вопрос]                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Нет вопросов? [Пропустить]          [Назад] [Завершить]   │
└─────────────────────────────────────────────────────────────┘
```

---

## Порядок реализации

1. **Фаза 1: Сортировка**
   - Исправить `useContainerLessons.ts` (порядок ORDER BY)
   - Добавить UI-переключатель сортировки в `Knowledge.tsx`
   - Сделать кнопку "Фильтр по дате" рабочей

2. **Фаза 2: Мастер KB**
   - Создать `KbLessonFormFields.tsx`
   - Создать `KbQuestionInput.tsx`
   - Модифицировать `ContentCreationWizard.tsx` для обнаружения раздела KB
   - Добавить шаг "Вопросы" в wizard flow

3. **Фаза 3: Интеграция**
   - Логика сохранения в `kb_questions`
   - Автоматическое создание блока видео
   - Генерация превью через AI

---

## SQL-миграция (не требуется)

Существующие таблицы `training_lessons` и `kb_questions` уже содержат все необходимые поля:
- `sort_order` — для номера выпуска
- `published_at` — для даты публикации
- `episode_number`, `question_number`, `timecode_seconds` — в `kb_questions`

