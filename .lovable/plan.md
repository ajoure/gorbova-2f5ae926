План: Исправление импорта видеоответов (PATCH 1–7, финальная версия)

Обзор проблем

На основе скриншотов и текущей реализации выявлены критические причины сбоев:
	1.	Таймкоды из Excel как числа: 0.11319... (доля суток) и/или 2.0638... (десятичное время) вместо hh:mm:ss
	2.	Даты Excel serial: 45299 вместо 2024-01-08
	3.	86 выпусков вместо 74: группировка по kinescopeUrl вместо episode_number
	4.	Мусор в номере выпуска: 45302 попадает как выпуск из-за слишком либерального парсинга
	5.	Неверный формат ссылки Kinescope: /embed/ ломает «поделиться» ссылку с таймкодом
	6.	Ошибки валидации неуправляемые: плоский список из 61+ строк без типов/экспорта
	7.	Нет STOP-предохранителей: Test Run/Bulk Run допускаются при критических ошибках

⸻

PATCH-1: Kinescope URL + таймкод (строго как share-link, без /embed/)

Проблема

Нужно формировать ссылку как в Kinescope “Поделиться”: https://kinescope.io/<VIDEO_ID>?t=<seconds>.

Решение

Файл: src/hooks/useKbQuestions.ts → buildKinescopeUrlWithTimecode

export function buildKinescopeUrlWithTimecode(
  baseUrl: string | null | undefined,
  timecodeSeconds: number | null
): string {
  if (!baseUrl) return "#";

  let url = String(baseUrl).trim();
  if (!url) return "#";

  // normalize: remove /embed/ if ever present
  url = url.replace("kinescope.io/embed/", "kinescope.io/");

  // remove existing t=
  url = url.replace(/[?&]t=\d+/g, "");

  if (timecodeSeconds && timecodeSeconds > 0) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}t=${Math.floor(timecodeSeconds)}`;
  }

  return url;
}

Ожидаемый результат: https://kinescope.io/9B2agTXSkHGqAa... ?t=60

⸻

PATCH-2: Парсинг таймкодов из Excel (числа + строки)

Проблема

XLSX возвращает тайминг как число:
	•	< 1 = доля суток (0.5 = 12:00:00)
	•	иногда встречается «десятичные часы» (2.0638 ≈ 02:03:49)

Решение

Файл: src/hooks/useKbQuestions.ts → parseTimecode

export function parseTimecode(
  timecode: string | number | undefined | null
): number | null {
  if (timecode === null || timecode === undefined) return null;

  // Excel numeric formats
  if (typeof timecode === "number") {
    if (!Number.isFinite(timecode) || timecode <= 0) return null;

    // fraction of day (Excel time)
    if (timecode < 1) return Math.round(timecode * 86400);

    // decimal hours (rare but seen in preview)
    if (timecode <= 24) return Math.round(timecode * 3600);

    // fallback: assume already seconds
    return Math.round(timecode);
  }

  const cleaned = String(timecode).trim();
  if (!cleaned) return null;

  const parts = cleaned.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];

  return null;
}


⸻

PATCH-3: Парсинг дат Excel serial (числа + строки)

Проблема

В файле дата иногда приходит как 45299, что ломает insert в date.

Решение

Файл: src/pages/admin/AdminKbImport.tsx → parseDate

const parseDate = (value: string | number | Date | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "";

  // Date object (если XLSX отдаст дату)
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  // Excel serial (число или строка из 5 цифр)
  const asString = String(value).trim();
  if (typeof value === "number" || /^\d{5}$/.test(asString)) {
    const serial = typeof value === "number" ? value : parseInt(asString, 10);
    if (!Number.isFinite(serial) || serial <= 0) return "";

    // 1899-12-30 (Excel 1900 system with leap bug compensation)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + serial * 86400000);
    return date.toISOString().slice(0, 10);
  }

  // DD.MM.YY / DD.MM.YYYY
  const m = asString.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(asString)) return asString.slice(0, 10);

  return "";
};


⸻

PATCH-4: Группировка выпусков строго по episode_number (не по URL)

Проблема

Группировка по URL даёт лишние группы (86 вместо 74).

Решение

Файл: src/pages/admin/AdminKbImport.tsx → группировка

const episodeMap = new Map<number, GroupedEpisode>();

parsed.forEach((row) => {
  if (!row.episodeNumber) return;

  if (!episodeMap.has(row.episodeNumber)) {
    episodeMap.set(row.episodeNumber, {
      episodeNumber: row.episodeNumber,
      answerDate: row.answerDate,
      kinescopeUrl: row.kinescopeUrl || "",
      questions: [],
      description: "",
      errors: [],
      warnings: [],
    } as any);
  }

  const ep = episodeMap.get(row.episodeNumber)!;
  ep.questions.push(row);

  // URL normalization & collision warning
  const url = String(row.kinescopeUrl || "").trim();
  if (url) {
    if (!ep.kinescopeUrl) ep.kinescopeUrl = url;
    else if (ep.kinescopeUrl !== url) ep.warnings.push(`Коллизия Kinescope URL: "${ep.kinescopeUrl}" vs "${url}"`);
  }
});

const episodes = Array.from(episodeMap.values())
  .sort((a, b) => b.episodeNumber - a.episodeNumber)
  .map((ep) => ({
    ...ep,
    errors: ep.questions.flatMap((q) => q.errors),
  }));


⸻

PATCH-5: Строгий парсинг номера выпуска + отсечение мусора

Проблема

Числа типа 45302 ошибочно считаются выпуском.

Решение

Файл: src/pages/admin/AdminKbImport.tsx → parseEpisodeNumber

const MAX_EPISODE_NUMBER = 200;

const parseEpisodeNumber = (value: string | number): number => {
  const str = String(value ?? "").trim();
  if (!str) return 0;

  const m = str.match(/выпуск\s*№?\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return n > 0 && n <= MAX_EPISODE_NUMBER ? n : 0;
  }

  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return n > 0 && n <= MAX_EPISODE_NUMBER ? n : 0;
  }

  return 0;
};


⸻

PATCH-6: Структурированные ошибки (группировка + CSV экспорт)

Решение

Файл: src/pages/admin/AdminKbImport.tsx
	1.	Структура ошибок

type ValidationErrorType = "empty_title" | "no_episode" | "no_kinescope" | "no_date" | "bad_timecode";

interface ValidationError {
  row: number;                 // номер строки Excel (как показываем пользователю)
  type: ValidationErrorType;
  message: string;
  values: Record<string, any>; // срез исходных ячеек
}

	2.	Сбор ошибок (вместо string[])

	•	хранить validationErrors: ValidationError[]
	•	в UI показывать группы (по type) + счётчики

	3.	Экспорт CSV

const downloadErrorsCsv = () => {
  const header = ["row", "type", "message", "values_json"];
  const lines = state.validationErrors.map(e =>
    [e.row, e.type, e.message, JSON.stringify(e.values)].join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kb-import-errors.csv";
  a.click();
  URL.revokeObjectURL(url);
};


⸻

PATCH-7: STOP-предохранители для Test Run и Bulk Run

Проблема

Запуск допускается при критических ошибках (и потом ловим DB error).

Решение

Файл: src/pages/admin/AdminKbImport.tsx
	1.	Test Run — блокировать, если у выпуска есть критические ошибки:

	•	нет kinescopeUrl
	•	нет answerDate
	•	есть вопросы без title

	2.	Bulk Run — запрещён, если есть любые ERROR-валидации (не warnings)

const getCriticalErrorsForEpisode = (ep: GroupedEpisode): string[] => {
  const critical: string[] = [];
  if (!ep.kinescopeUrl) critical.push("Нет ссылки Kinescope");
  if (!ep.answerDate) critical.push("Нет даты выпуска");

  const emptyTitles = ep.questions.filter(q => !q.title).length;
  if (emptyTitles > 0) critical.push(`${emptyTitles} вопросов без заголовка`);

  return critical;
};

const hasAnyValidationErrors = state.validationErrors.length > 0;

UI правила:
	•	Bulk Run disabled если hasAnyValidationErrors
	•	Test Run disabled если нет номера или есть critical errors у выбранного выпуска

⸻

Файлы для изменения

Файл	Изменения
src/hooks/useKbQuestions.ts	PATCH-1 (URL без embed), PATCH-2 (parseTimecode: number+string)
src/pages/admin/AdminKbImport.tsx	PATCH-3 (parseDate: serial+Date), PATCH-4 (group by episode_number), PATCH-5 (strict episode parser), PATCH-6 (typed errors + CSV), PATCH-7 (STOP-guards)


⸻

DoD (Definition of Done)

UI/логика:
	1.	Статистика показывает 74 выпуска (не 86)
	2.	В предпросмотре таймкоды отображаются как 00:06:47 (не дроби)
	3.	В логах импорта нет invalid input syntax for type date: "45299"
	4.	Номера выпусков строго в диапазоне 1..74 (нет 45302)
	5.	Ошибки валидации: группы + счётчики + CSV экспорт
	6.	Bulk Run запрещён при любых ERROR-валидациях
	7.	Test Run запрещён при критических ошибках выбранного выпуска
	8.	Kinescope ссылки открываются как https://kinescope.io/<id>?t=<sec>

SQL-пруфы после успешного bulk-импорта:

SELECT COUNT(DISTINCT episode_number) FROM kb_questions;  -- 74

SELECT episode_number, COUNT(*) 
FROM kb_questions 
GROUP BY episode_number 
ORDER BY episode_number DESC 
LIMIT 5;  -- 70..74

SELECT timecode_seconds 
FROM kb_questions 
WHERE episode_number = 74 
LIMIT 3; -- целые секунды (например 60, 122, 361)

Обязательный пруф выполнения (в конце отчёта)
	•	1 скрин страницы /admin/kb-import после фикса, где видно:
	•	74 выпуска
	•	таймкоды в формате времени
	•	Bulk Run задизейблен при ошибках (если есть) или успешный итог без ошибок
	•	1 скрин с результатом SQL-проверок (Supabase SQL editor) по трём запросам выше. выведи закладку в тренингах "Импорт" с переходом на /admin/kb-import чтоб можно было на эту страницу зайти.