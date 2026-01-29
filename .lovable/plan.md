

# План: Исправления для импорта и отображения Базы знаний

## Выявленные проблемы

| # | Проблема | Где происходит |
|---|----------|----------------|
| 1 | Клик на вопрос открывает **внешний сайт Kinescope** вместо навигации внутри платформы | `Knowledge.tsx` строки 121-130 |
| 2 | Дата в видео отображается как `2026-01-28` вместо `28.01.2026` | `VideoBlock.tsx` (поле `content.title`), `LessonCard.tsx` (формат даты) |
| 3 | AI генерирует картинки **с текстом** (нечитаемым) | `generate-cover/index.ts` — промпт |
| 4 | Сортировка не хронологическая (от новых к старым) | `useContainerLessons.ts`, `useKbQuestions.ts` |
| 5 | Описание урока берётся неправильно | `AdminKbImport.tsx` — нужно использовать поля из файла |

---

## Решения

### 1. Вопросы открываются внутри платформы (не Kinescope)

**Файл: `src/pages/Knowledge.tsx`**

Сейчас:
```tsx
<a 
  href={videoUrl}
  target="_blank"
  rel="noopener noreferrer"
  ...
>
  <Play className="h-4 w-4" />
  Смотреть видеоответ
  <ExternalLink className="h-3 w-3" />
</a>
```

Нужно заменить на навигацию внутри платформы через `useNavigate`:
- Получить `lesson.slug` и `lesson.module.slug` из вопроса (уже есть в запросе)
- При клике: `navigate(`/library/${moduleSlug}/${lessonSlug}?t=${timecode}`)`
- Убрать иконку `ExternalLink`, заменить на внутреннюю навигацию

```tsx
import { useNavigate } from "react-router-dom";

// В QuestionsContent:
const navigate = useNavigate();

// При клике на вопрос:
const handleQuestionClick = (question: KbQuestion) => {
  const moduleSlug = question.lesson?.module?.slug;
  const lessonSlug = question.lesson?.slug;
  
  if (moduleSlug && lessonSlug) {
    navigate(`/library/${moduleSlug}/${lessonSlug}`, { 
      state: { seekTo: question.timecode_seconds } 
    });
  }
};
```

### 2. Формат даты `dd.MM.yyyy` вместо `YYYY-MM-DD`

**Файл: `src/components/training/LessonCard.tsx`**

Изменить формат даты:
```tsx
// БЫЛО:
const formattedDate = displayDate
  ? format(new Date(displayDate), "d MMM yyyy", { locale: ru })
  : null;

// СТАНЕТ:
const formattedDate = displayDate
  ? format(new Date(displayDate), "dd.MM.yyyy")
  : null;
```

**Файл: `src/pages/admin/AdminKbImport.tsx`**

При создании video block, поле `title` сохраняет дату в правильном формате:
```tsx
// БЫЛО (строка 894):
content: {
  url: episode.kinescopeUrl,
  title: episode.answerDate,  // ISO формат "2026-01-28"
  provider: "kinescope",
}

// СТАНЕТ:
content: {
  url: episode.kinescopeUrl,
  title: episode.answerDate 
    ? format(new Date(episode.answerDate), "dd.MM.yyyy") 
    : null,
  provider: "kinescope",
}
```

Добавить импорт `format` из `date-fns`.

**Файл: `src/pages/Knowledge.tsx`**

Изменить формат даты вопросов:
```tsx
// БЫЛО (строка 88):
const formattedDate = question.answer_date
  ? format(new Date(question.answer_date), "d MMM yyyy", { locale: ru })
  : null;

// СТАНЕТ:
const formattedDate = question.answer_date
  ? format(new Date(question.answer_date), "dd.MM.yyyy")
  : null;
```

### 3. AI обложки без текста

**Файл: `supabase/functions/generate-cover/index.ts`**

Обновить промпт, убрать текст и сделать акцент на смысловых изображениях:
```typescript
const prompt = `Create a professional cover image for an educational video lesson about accounting and law.

Topics: "${title}"
${description ? `Details: ${description}` : ""}

CRITICAL REQUIREMENTS:
- NO TEXT whatsoever - absolutely no letters, numbers, words, or any written content on the image
- NO logos, NO watermarks, NO captions
- Only meaningful visual imagery that represents the topic
- Use symbolic icons and illustrations: documents, calculators, coins, charts, scales of justice, buildings, computers, folders, contracts, stamps, etc.
- Professional business illustration style
- Clean, modern aesthetic with soft gradients
- Light, professional color palette (blues, teals, soft purples, whites)
- 16:9 aspect ratio (1200x630 pixels)
- High quality, sharp imagery

The image should convey the topic through visual symbols only, without any text.`;
```

### 4. Хронологическая сортировка (от новых к старым)

**Файл: `src/hooks/useContainerLessons.ts`**

Уже правильно сортирует по `published_at DESC` (строки 57-59). Проверить, что `published_at` заполняется при импорте.

**Файл: `src/hooks/useKbQuestions.ts`**

Уже правильно сортирует по `answer_date DESC` (строка 59). Проверить порядок в UI.

**Файл: `src/pages/admin/AdminKbImport.tsx`**

Сортировка эпизодов уже правильная (строка 729):
```tsx
.sort((a, b) => b.episodeNumber - a.episodeNumber)
```

При импорте вопросов добавить сортировку по `question_number ASC` для правильного порядка внутри эпизода.

### 5. Описания уроков из файла

**Файл: `src/pages/admin/AdminKbImport.tsx`**

Сейчас при импорте:
- `shortDescription` = из "Кратко: ..." (колонка "Суть вопроса")
- `fullDescription` = из "Описание выпуска (подробно): ..." (колонка "Вопрос участника")

Изменить логику использования описаний:
```tsx
// При создании урока:
const description = episode.shortDescription || 
  EPISODE_SUMMARIES[episode.episodeNumber] || 
  getEpisodeSummary(episode.episodeNumber, episode.questions.map(q => q.title));

// Для AI обложки использовать полное описание:
const coverDescription = episode.fullDescription || episode.shortDescription || description;
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/Knowledge.tsx` | Заменить внешнюю ссылку на `navigate()` внутри платформы, формат даты |
| `src/components/training/LessonCard.tsx` | Формат даты `dd.MM.yyyy` |
| `src/pages/admin/AdminKbImport.tsx` | Формат даты в video block, импорт `format` |
| `supabase/functions/generate-cover/index.ts` | Обновить промпт без текста |

---

## DoD (обязательно)

1. ✅ Клик на вопрос → навигация внутри платформы (не внешний сайт)
2. ✅ Дата отображается как `28.01.2026` (не `2026-01-28`)
3. ✅ AI обложки без текста — только иконки и символы
4. ✅ Сортировка: новые выпуски вверху
5. ✅ Описания берутся из файла ("Суть вопроса" = краткое, "Вопрос участника" = полное)
6. Скриншоты: страница вопроса внутри платформы, карточка с датой, обложка без текста

