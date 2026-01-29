
# План: Адаптация KB Import для файла БУКВА_ЗАКОНА_IMPORT_v2.xlsx

## Анализ структуры файла

Файл содержит **~75 выпусков** и **~500+ вопросов** со следующей структурой:

| # | Колонка в файле | Текущий маппинг | Статус |
|---|-----------------|-----------------|--------|
| 0 | `Дата ответа` | ✅ работает | — |
| 1 | `Выпуск` | ❌ НЕТ (только "номер выпуска") | **Добавить** |
| 2 | `Вопрос` | ❌ НЕТ (только "номер вопроса") | **Добавить** |
| 3 | `Вопрос участника Клуба...` | ❌ НЕТ | **Добавить → fullQuestion** |
| 4 | `Суть вопроса` | ✅ работает | — |
| 5 | `Ссылка на видео в кинескопе` | ✅ работает | — |
| 6 | `Тайминг старта ответа` | ❌ частично | **Добавить "тайминг старта"** |
| 7 | `Время (секунды)` | ✅ работает | — |

### Ключевая логика из файла

**Строка-описание выпуска** (когда `Вопрос` = пустой):
- `fullQuestion` содержит: `"Описание выпуска (подробно): ..."` — **полное описание**
- `title` содержит: `"Кратко: ..."` — **краткое описание**
- `kinescopeUrl` — ссылка на видео **БЕЗ таймкода**

**Строка-вопрос** (когда `Вопрос` = число):
- `kinescopeUrl` уже содержит таймкод в URL: `?t=4013`
- `timecodeSeconds` / `Время (секунды)` — резервный столбец (можно игнорировать, приоритет URL)

## Что нужно исправить

### 1. Расширить CSV_COLUMN_MAP для новых заголовков

Добавить маппинги для заголовков из нового файла:

```typescript
const CSV_COLUMN_MAP = {
  // ... существующие
  "выпуск": "episodeNumber",           // NEW: без "номер"
  "вопрос участника": "fullQuestion",   // NEW: длинное название
  "тайминг старта": "timecode",         // NEW: другой вариант
};
```

### 2. Извлекать таймкод из URL Kinescope

Если URL содержит `?t=1234`, извлекать секунды оттуда:

```typescript
function extractTimecodeFromUrl(url: string): number | null {
  const match = url.match(/[?&]t=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
```

Приоритет получения таймкода:
1. `timecodeSeconds` (колонка "Время (секунды)")
2. Извлечь из URL `?t=...`
3. Распарсить строку "01:06:53" через `parseTimecode()`

### 3. Обрабатывать строки-описания выпусков

Когда `questionNumber` пустой:
- Это **НЕ вопрос**, а **метаданные выпуска**
- Извлечь полное описание из `fullQuestion` (после "Описание выпуска (подробно):")
- Извлечь краткое описание из `title` (после "Кратко:")
- URL — это ссылка на видео целиком (без `?t=`)

Логика:
```typescript
const isEpisodeDescription = !questionNumber || questionNumber === "";

if (isEpisodeDescription) {
  // Парсим описания
  const fullDesc = parseEpisodeDescription(fullQuestion); // "Описание выпуска (подробно): ..."
  const shortDesc = parseShortDescription(title);         // "Кратко: ..."
  
  episode.fullDescription = fullDesc;
  episode.shortDescription = shortDesc;
  episode.kinescopeUrl = kinescopeUrl; // Без таймкода
  
  // НЕ добавлять в questions[]
  return;
}
```

### 4. Обновить COLUMN_ORDER для XLSX файлов

Позиционный маппинг для структуры нового файла (8 колонок):

```typescript
const COLUMN_ORDER_V2 = [
  "answerDate",      // 0: Дата ответа
  "episodeNumber",   // 1: Выпуск
  "questionNumber",  // 2: Вопрос
  "fullQuestion",    // 3: Вопрос участника Клуба
  "title",           // 4: Суть вопроса
  "kinescopeUrl",    // 5: Ссылка на видео
  "timecode",        // 6: Тайминг старта ответа
  "timecodeSeconds", // 7: Время (секунды)
];
```

### 5. Убрать валидацию "пустая суть" для строк-описаний

Сейчас код выдаёт ошибку "пустая суть вопроса" для строк, где `title` начинается с "Кратко:". Это нормально для описаний — не должно быть ошибкой.

### 6. Генерация AI-обложек при создании урока

После создания нового урока вызывать edge-функцию `generate-cover`:

```typescript
// В функции importEpisode, после создания урока
if (!existing) {
  // Trigger AI cover generation for new lessons
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    
    const coverResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cover`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title,
          description: episode.shortDescription || episode.description,
          moduleId: lessonId,
        }),
      }
    );
    
    const coverResult = await coverResponse.json();
    if (coverResult.url) {
      await supabase
        .from("training_lessons")
        .update({ thumbnail_url: coverResult.url })
        .eq("id", lessonId);
    }
  } catch (err) {
    console.warn("Cover generation failed:", err);
    // Продолжаем импорт без обложки
  }
}
```

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/pages/admin/AdminKbImport.tsx` | Расширить маппинги, добавить обработку строк-описаний, извлечение таймкода из URL, генерацию обложек |

## Детальный diff

### AdminKbImport.tsx — CSV_COLUMN_MAP (строки 37-49)

```typescript
// БЫЛО:
const CSV_COLUMN_MAP = {
  "дата ответа": "answerDate",
  "номер выпуска": "episodeNumber",
  "номер вопроса": "questionNumber",
  "вопрос ученика": "fullQuestion",
  "суть вопроса": "title",
  "теги": "tags",
  "ссылка на видео в геткурсе": "getcourseUrl",
  "ссылка на видео в кинескопе": "kinescopeUrl",
  "тайминг": "timecode",
  "время (секунды)": "timecodeSeconds",
  "год": "year",
};

// СТАНЕТ:
const CSV_COLUMN_MAP = {
  "дата ответа": "answerDate",
  "номер выпуска": "episodeNumber",
  "выпуск": "episodeNumber",           // NEW: короткий вариант
  "номер вопроса": "questionNumber",
  "вопрос участника": "fullQuestion",   // NEW: длинное название
  "вопрос ученика": "fullQuestion",
  "суть вопроса": "title",
  "теги": "tags",
  "ссылка на видео в геткурсе": "getcourseUrl",
  "ссылка на видео в кинескопе": "kinescopeUrl",
  "тайминг старта": "timecode",         // NEW: другой вариант
  "тайминг": "timecode",
  "время (секунды)": "timecodeSeconds",
  "год": "year",
};
```

### AdminKbImport.tsx — COLUMN_ORDER (строки 53-65)

```typescript
// Обновить под структуру 8 колонок:
const COLUMN_ORDER = [
  "answerDate",      // 0: Дата ответа
  "episodeNumber",   // 1: Выпуск
  "questionNumber",  // 2: Вопрос
  "fullQuestion",    // 3: Вопрос участника
  "title",           // 4: Суть вопроса
  "kinescopeUrl",    // 5: Ссылка на видео в кинескопе
  "timecode",        // 6: Тайминг старта ответа
  "timecodeSeconds", // 7: Время (секунды)
];
```

### AdminKbImport.tsx — новая функция extractTimecodeFromUrl

```typescript
/**
 * Extract timecode seconds from Kinescope URL (?t=1234)
 */
function extractTimecodeFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = String(url).match(/[?&]t=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
```

### AdminKbImport.tsx — новые функции для парсинга описаний

```typescript
/**
 * Parse full description from "Описание выпуска (подробно): ..."
 */
function parseFullDescription(text: string): string {
  const match = text.match(/Описание выпуска \(подробно\):\s*(.+)/i);
  return match ? match[1].trim() : text;
}

/**
 * Parse short description from "Кратко: ..."
 */
function parseShortDescription(text: string): string {
  const match = text.match(/Кратко:\s*(.+)/i);
  return match ? match[1].trim() : text;
}

/**
 * Check if row is episode description (not a question)
 */
function isEpisodeDescriptionRow(questionNumber: any): boolean {
  return !questionNumber || String(questionNumber).trim() === "";
}
```

### AdminKbImport.tsx — обновление парсинга (строки 517-532)

```typescript
// БЫЛО: приоритет колонки "Время (секунды)", потом parseTimecode
// СТАНЕТ: приоритет колонки → URL → parseTimecode

let timecodeSeconds: number | null = null;

// 1. Try seconds column first (numeric)
if (secondsRaw !== undefined && secondsRaw !== null && secondsRaw !== "") {
  const sec = parseInt(String(secondsRaw), 10);
  if (!isNaN(sec) && sec >= 0) {
    timecodeSeconds = sec;
  }
}

// 2. Try extracting from Kinescope URL (?t=1234)
if (timecodeSeconds === null) {
  timecodeSeconds = extractTimecodeFromUrl(kinescopeUrl);
}

// 3. Fallback to parsing timecode string
if (timecodeSeconds === null) {
  timecodeSeconds = parseTimecode(timecodeRaw);
}
```

### AdminKbImport.tsx — обработка строк-описаний в группировке (строки 600-650)

```typescript
// В forEach по parsed rows:
parsed.forEach((row) => {
  if (!row.episodeNumber) return;

  // Check if this is an episode description row (empty questionNumber)
  const isDescription = isEpisodeDescriptionRow(row.questionNumber);

  if (!episodeMap.has(row.episodeNumber)) {
    episodeMap.set(row.episodeNumber, {
      episodeNumber: row.episodeNumber,
      answerDate: row.answerDate,
      kinescopeUrl: "",
      questions: [],
      description: "",
      fullDescription: "",  // NEW
      shortDescription: "", // NEW
      errors: [],
      warnings: [],
    });
  }

  const ep = episodeMap.get(row.episodeNumber)!;

  if (isDescription) {
    // This row is episode metadata, not a question
    ep.fullDescription = parseFullDescription(row.fullQuestion);
    ep.shortDescription = parseShortDescription(row.title);
    
    // URL from description row is the main video (without timecode)
    if (row.kinescopeUrl && !ep.kinescopeUrl) {
      ep.kinescopeUrl = row.kinescopeUrl;
    }
    
    // Don't add to questions
    return;
  }

  // Regular question row
  ep.questions.push(row);
  // ... rest of existing logic
});
```

### AdminKbImport.tsx — использование описаний при импорте (строки 740-750)

```typescript
// В функции importEpisode:
const description = state.usePredefinedSummaries
  ? EPISODE_SUMMARIES[episode.episodeNumber] || episode.shortDescription || episode.description
  : episode.shortDescription || episode.description;
```

### AdminKbImport.tsx — генерация обложки после создания урока (после строки 807)

```typescript
// После создания video block:
if (blockError) console.warn("Block creation failed:", blockError);

// Generate AI cover for new lesson
try {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  
  if (token) {
    const coverResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cover`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title,
          description: episode.shortDescription || description,
          moduleId: lessonId,
        }),
      }
    );
    
    if (coverResponse.ok) {
      const coverResult = await coverResponse.json();
      if (coverResult.url) {
        await supabase
          .from("training_lessons")
          .update({ thumbnail_url: coverResult.url })
          .eq("id", lessonId);
      }
    }
  }
} catch (err) {
  console.warn("Cover generation failed (non-blocking):", err);
}
```

## Ожидаемый результат

После правок импорт файла `Эфиры_БУКВА_ЗАКОНА_IMPORT_v2.xlsx`:

1. ✅ Корректно распознает все 8 колонок (новые маппинги)
2. ✅ Отделяет строки-описания от вопросов
3. ✅ Извлекает полное и краткое описание из строк-описаний
4. ✅ Извлекает таймкод из URL `?t=...` (приоритет над пустой колонкой)
5. ✅ Группирует по ~75 выпускам
6. ✅ Создаёт уроки с правильными описаниями
7. ✅ Автоматически генерирует AI-обложки для новых уроков
8. ✅ Создаёт записи в `kb_questions` с таймкодами

## DoD (обязательно)

1. Загрузить файл `Эфиры_БУКВА_ЗАКОНА_IMPORT_v2.xlsx` на `/admin/kb-import`
2. Убедиться, что парсинг без ошибок:
   - Нет "пустая суть вопроса" для строк-описаний
   - Нет "нет номера выпуска"
   - Таймкоды извлечены из URL
3. Preview: проверить что выпуск 1 имеет описание из файла
4. Test Run на 1 выпуске — проверить создание урока + вопросов + обложки
5. Скриншоты: UI импорта, карточка урока с обложкой, список вопросов в БЗ
6. Diff-summary: `src/pages/admin/AdminKbImport.tsx`
