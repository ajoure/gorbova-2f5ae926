/**
 * Утилита для извлечения storage_path из JSON-контента блоков и прогресса.
 * Используется при cleanup (reset progress, delete lesson).
 */

const ALLOWED_PREFIXES = ["lesson-audio/", "lesson-files/", "lesson-images/", "student-uploads/"];

function isValidPath(p: unknown): p is string {
  if (!p || typeof p !== "string") return false;
  if (p.includes("..") || p.includes("//") || p.startsWith("/")) return false;
  return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Рекурсивно извлекает все storage_path / storagePath из произвольного JSON.
 * Поддерживает:
 * - block content: { storagePath: "..." }
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

    // Recurse into known containers
    if (record.items) walk(record.items);
    if (record.files) walk(record.files);
    if (record.file && typeof record.file === "object") walk(record.file);
    // Also walk content if it's an object (for block content wrappers)
    if (record.content && typeof record.content === "object") walk(record.content);
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
