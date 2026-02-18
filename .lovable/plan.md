
# Аудит замечаний по uploadToTrainingAssets — реальные находки

## Результаты проверки (факты из кода)

### Замечание 1: Сигнатура ownerId — НОРМА, проблем нет

`uploadToTrainingAssets` (строки 50–57):
```typescript
export async function uploadToTrainingAssets(
  file: File,
  folderPrefix: string,
  maxSizeMB: number,
  acceptMimePrefix?: string,
  allowedExtensions?: string[],
  ownerId?: string  // ← 6-й параметр уже есть
): Promise<...>
```

Все вызовы передают `lessonId` шестым аргументом:
- `GalleryBlock.tsx` строка 92: `ownerId` (нормализованный trim)
- `AudioBlock.tsx` строка 59: `lessonId` (без trim!)
- `FileBlock.tsx` строка 64: `lessonId` (без trim!)

TypeScript не ругается — сигнатура совместима. DoD-контроль пройден.

### Замечание 2: Комментарий в GalleryBlock строка 92 — НОРМА

```typescript
ownerId // нормализованный ownerId → lesson-images/<lessonId>/...
```

Путь в комментарии `lesson-images/<lessonId>/...` — корректный (не задвоен `/`). Это не ошибка. Менять не нужно.

### Замечание 3: РЕАЛЬНЫЙ БАГ — `ownerId` без trim в AudioBlock и FileBlock

**GalleryBlock** — правильно:
```typescript
// handleFileUpload (строка 81):
const ownerId = (lessonId || "").trim();
// deleteItem (строка 253):
const ownerId = (lessonId || "").trim();
```

**AudioBlock** — неправильно:
```typescript
// handleFileUpload (строка 59):
uploadToTrainingAssets(file, "lesson-audio", 100, "audio/", ALLOWED_AUDIO_EXTENSIONS, lessonId)
// deleteTrainingAssets (строка 68):
const entity = lessonId ? { type: "lesson", id: lessonId } : undefined;
```

`lessonId` передаётся напрямую без `.trim()`. Внутри `uploadToTrainingAssets` есть нормализация (строки 95–97), но в `entity` для `deleteTrainingAssets` используется ненормализованный `lessonId`.

**FileBlock** — аналогично:
```typescript
// handleFileUpload (строка 64):
uploadToTrainingAssets(file, "lesson-files", 50, undefined, ALLOWED_FILE_EXTENSIONS, lessonId)
// deleteTrainingAssets (строка 81):
const entity = lessonId ? { type: "lesson", id: lessonId } : undefined;
```

**Риск:** если `lessonId` придёт с пробелами — путь в Storage будет `lesson-audio/lessonId/...` (с trim внутри утилиты), а `entity.id` для ownership guard в Edge Function будет `" lessonId "` (с пробелами). Guard сравнивает `path.startsWith(prefix + lessonId + "/")` — ownership mismatch → удаление заблокируется.

## Что нужно исправить (минимальный diff, 2 файла)

### ПРАВКА 1: AudioBlock.tsx

В `handleFileUpload` — нормализовать `ownerId` один раз и использовать везде:

```typescript
// БЫЛО (строки 46–74):
const handleFileUpload = async (file: File) => {
  try {
    setUploading(true);
    const prevPath = ...;
    const result = await uploadToTrainingAssets(
      file, "lesson-audio", 100, "audio/", ALLOWED_AUDIO_EXTENSIONS,
      lessonId   // ← без trim
    );
    if (result) {
      ...
      if (prevPath && prevPath !== storagePath) {
        const entity = lessonId ? { type: "lesson", id: lessonId } : undefined;  // ← без trim
        deleteTrainingAssets([prevPath], entity, "audio_replaced");
      }
    }
  } finally { ... }
};

// СТАНЕТ:
const handleFileUpload = async (file: File) => {
  try {
    setUploading(true);
    const ownerId = (lessonId || "").trim();  // ← единая точка
    const entity = ownerId ? { type: "lesson", id: ownerId } : undefined;
    const prevPath = ...;
    const result = await uploadToTrainingAssets(
      file, "lesson-audio", 100, "audio/", ALLOWED_AUDIO_EXTENSIONS,
      ownerId    // ← нормализованный
    );
    if (result) {
      ...
      if (prevPath && prevPath !== storagePath) {
        deleteTrainingAssets([prevPath], entity, "audio_replaced");  // ← entity уже нормализован
      }
    }
  } finally { ... }
};
```

### ПРАВКА 2: FileBlock.tsx

Аналогично — нормализовать `ownerId` один раз:

```typescript
// БЫЛО:
const result = await uploadToTrainingAssets(
  file, "lesson-files", 50, undefined, ALLOWED_FILE_EXTENSIONS,
  lessonId   // ← без trim
);
if (result) {
  ...
  if (prevPath && prevPath !== storagePath) {
    const entity = lessonId ? { type: "lesson", id: lessonId } : undefined;  // ← без trim
    deleteTrainingAssets([prevPath], entity, "file_replaced");
  }
}

// СТАНЕТ:
const ownerId = (lessonId || "").trim();  // ← единая точка
const entity = ownerId ? { type: "lesson", id: ownerId } : undefined;
const result = await uploadToTrainingAssets(
  file, "lesson-files", 50, undefined, ALLOWED_FILE_EXTENSIONS,
  ownerId    // ← нормализованный
);
if (result) {
  ...
  if (prevPath && prevPath !== storagePath) {
    deleteTrainingAssets([prevPath], entity, "file_replaced");  // ← entity уже нормализован
  }
}
```

## Что НЕ меняем

- `uploadToTrainingAssets.ts` — сигнатура и нормализация внутри функции правильные
- `GalleryBlock.tsx` — уже правильно нормализован
- Комментарий в строке 92 GalleryBlock — корректный, менять не нужно
- Edge Function `training-assets-delete` — guards правильные

## Таблица правок

| # | Файл | Строки | Изменение |
|---|------|--------|-----------|
| 1 | `AudioBlock.tsx` | 46–74 | Добавить `const ownerId = (lessonId \|\| "").trim()` и `const entity = ...` в начало `handleFileUpload`, использовать вместо `lessonId` |
| 2 | `FileBlock.tsx` | 51–87 | Аналогично — вынести `ownerId` и `entity` в начало `handleFileUpload` |

## DoD

- После правки: `AudioBlock` и `FileBlock` передают в `uploadToTrainingAssets` и `deleteTrainingAssets` одинаково нормализованный `ownerId`
- Ownership guard в Edge Function получает одинаковый `lessonId` и в пути файла, и в `entity.id`
- TypeScript: без изменений типов, без новых зависимостей
- GalleryBlock: не трогаем — уже правильно
