/**
 * Утилита для извлечения storage_path из JSON-контента блоков и прогресса.
 * Используется при cleanup (reset progress, delete lesson).
 */

const ALLOWED_PREFIXES = ["lesson-audio/", "lesson-files/", "lesson-images/", "student-uploads/"];

/** Паттерн для извлечения storagePath из publicUrl Supabase Storage */
const PUBLIC_URL_PATTERN = /\/storage\/v1\/object\/public\/training-assets\/(.+)/;

function isValidPath(p: unknown): p is string {
  if (!p || typeof p !== "string") return false;
  if (p.includes("..") || p.includes("//") || p.startsWith("/")) return false;
  return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Пытается извлечь storagePath из publicUrl.
 * Возвращает null если это не URL нашего bucket или путь не проходит guards.
 */
function extractPathFromUrl(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  const match = url.match(PUBLIC_URL_PATTERN);
  if (!match) return null;
  const path = match[1];
  if (!isValidPath(path)) return null;
  return path;
}

/**
 * Рекурсивно извлекает все storage_path / storagePath / url из произвольного JSON.
 * Обходит ВСЕ ключи объекта рекурсивно (не только items/files/content).
 * Поддерживает:
 * - block content: { storagePath: "..." } или { url: "https://.../training-assets/..." }
 * - gallery items: { items: [{ storagePath: "..." }] }
 * - student progress response: { files: [{ storage_path: "..." }] }
 * - legacy progress: { file: { storage_path: "..." } } или { storage_path: "..." }
 */
export function extractTrainingAssetPaths(input: unknown): string[] {
  const found = new Set<string>();

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }

    const record = obj as Record<string, unknown>;

    // Direct path fields
    if (isValidPath(record.storagePath)) found.add(record.storagePath);
    if (isValidPath(record.storage_path)) found.add(record.storage_path);

    // Public URL → storagePath extraction (audio/file blocks store url)
    const urlPath = extractPathFromUrl(record.url);
    if (urlPath) found.add(urlPath);

    // Recurse into ALL values of the object
    for (const key of Object.keys(record)) {
      const val = record[key];
      if (val && typeof val === "object") {
        walk(val);
      }
    }
  }

  walk(input);
  return Array.from(found).sort();
}

/**
 * Извлекает пути из массива lesson_blocks (каждый имеет .content).
 */
export function extractPathsFromBlocks(blocks: Array<{ content: unknown }>): string[] {
  const allPaths = new Set<string>();
  for (const block of blocks) {
    for (const p of extractTrainingAssetPaths(block.content)) {
      allPaths.add(p);
    }
  }
  return Array.from(allPaths).sort();
}

/**
 * Извлекает пути из массива user_lesson_progress записей (каждая имеет .response).
 */
export function extractPathsFromProgress(progressRecords: Array<{ response: unknown }>): string[] {
  const allPaths = new Set<string>();
  for (const rec of progressRecords) {
    for (const p of extractTrainingAssetPaths(rec.response)) {
      allPaths.add(p);
    }
  }
  return Array.from(allPaths).sort();
}
