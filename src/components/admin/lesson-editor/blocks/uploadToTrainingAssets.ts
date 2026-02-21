import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Вспомогательная функция: определяет MIME по расширению файла.
 * Используется как fallback если file.type пустой/нестандартный.
 */
function extensionToMime(ext: string): string {
  const map: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".rtf": "application/rtf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Общая утилита загрузки файлов в бакет training-assets.
 *
 * Валидация: файл проходит если (mimeOk ИЛИ extOk).
 *
 * @param file            — загружаемый файл
 * @param folderPrefix    — папка внутри бакета (например "lesson-audio")
 * @param maxSizeMB       — максимальный размер в МБ
 * @param acceptMimePrefix — опциональный MIME-префикс для фильтрации
 * @param allowedExtensions — опциональный allowlist расширений
 * @param ownerId          — опциональный ID владельца (lessonId/moduleId) для изоляции пути
 *
 * @returns { publicUrl, storagePath } или null при ошибке
 */
export async function uploadToTrainingAssets(
  file: File,
  folderPrefix: string,
  maxSizeMB: number,
  acceptMimePrefix?: string,
  allowedExtensions?: string[],
  ownerId?: string
): Promise<{ publicUrl: string; storagePath: string } | null> {
  const fileExtension = "." + (file.name.split(".").pop()?.toLowerCase() || "");

  // Валидация типа: проходит если mimeOk ИЛИ extOk
  if (acceptMimePrefix || allowedExtensions) {
    const mimeOk = acceptMimePrefix ? file.type.startsWith(acceptMimePrefix) : false;
    const extOk = allowedExtensions ? allowedExtensions.includes(fileExtension) : false;

    if (!mimeOk && !extOk) {
      toast.error(`Неподдерживаемый формат файла`);
      return null;
    }
  }

  // Валидация размера ДО загрузки
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    toast.error(`Файл слишком большой. Максимум: ${maxSizeMB} МБ`);
    return null;
  }

  // Уникальное имя файла
  const uniqueId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2);

  // Безопасное имя файла
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 64);

  // Нормализуем ownerId: trim(), пробельная строка → как отсутствие
  const owner = (typeof ownerId === "string" ? ownerId : "").trim();

  // STOP-лог: ожидали lessonId для lesson-* папки, но не получили
  if (
    (folderPrefix === "lesson-audio" ||
      folderPrefix === "lesson-files" ||
      folderPrefix === "lesson-images") &&
    !owner
  ) {
    console.warn(
      `[uploadToTrainingAssets] ownerId missing or empty for "${folderPrefix}" (expected lessonId). File will be stored without ownership prefix.`
    );
  }

  // Формируем путь: folderPrefix/[owner/]timestamp-uuid-name
  const filePath = owner
    ? `${folderPrefix}/${owner}/${Date.now()}-${uniqueId}-${safeName}`
    : `${folderPrefix}/${Date.now()}-${uniqueId}-${safeName}`;

  // BUGFIX: приоритет extensionToMime над file.type (браузер может отдать text/rtf вместо application/rtf)
  const mapped = extensionToMime(fileExtension);
  const resolvedContentType =
    mapped !== "application/octet-stream" ? mapped : (file.type || mapped);

  // BUGFIX: Supabase SDK uses File.type internally, ignoring contentType option.
  // Re-create File from bytes with correct MIME to guarantee proper Content-Type.
  const uploadBody: File | Blob =
    file.type !== resolvedContentType
      ? new File([await file.arrayBuffer()], file.name, { type: resolvedContentType })
      : file;

  const { error: uploadError } = await supabase.storage
    .from("training-assets")
    .upload(filePath, uploadBody, { upsert: false, contentType: resolvedContentType });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    toast.error(`Ошибка загрузки: ${uploadError.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("training-assets")
    .getPublicUrl(filePath);

  return { publicUrl: urlData.publicUrl, storagePath: filePath };
}

/**
 * Преобразует Google Drive ссылку /file/d/ID/view → прямой URL для скачивания.
 */
export function convertGoogleDriveUrl(url: string): {
  converted: string | null;
  isGoogleDrive: boolean;
  fileId: string | null;
} {
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (!gdMatch) {
    return { converted: null, isGoogleDrive: false, fileId: null };
  }
  const fileId = gdMatch[1];
  const converted = `https://drive.google.com/uc?export=download&id=${fileId}`;
  return { converted, isGoogleDrive: true, fileId };
}

/**
 * Форматирует размер файла в удобочитаемый вид.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Строгий allowlist для guard-проверки
const STORAGE_ALLOWED_PREFIXES = ["lesson-audio/", "lesson-files/", "lesson-images/", "student-uploads/"];

/**
 * Извлекает storagePath из publicUrl Supabase Storage.
 * Возвращает null если URL не наш или путь не проходит guards.
 */
export function extractStoragePathFromPublicUrl(url: string): string | null {
  if (!url) return null;

  // Паттерн: /storage/v1/object/public/training-assets/<path>
  const match = url.match(/\/storage\/v1\/object\/public\/training-assets\/(.+)/);
  if (!match) return null;

  const path = match[1];

  // Guard: только наши префиксы
  if (!STORAGE_ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return null;
  // Guard: запрет traversal
  if (path.includes("..") || path.includes("//")) return null;

  return path;
}

/**
 * Безопасное удаление файлов из training-assets через Edge Function.
 * fire-and-forget: не блокирует UX, ошибки только в console.
 */
export async function deleteTrainingAssets(
  paths: string[],
  entity?: { type: string; id: string },
  reason = "client_delete"
): Promise<void> {
  if (!paths || paths.length === 0) return;

  // Фильтрация на клиенте — только наши префиксы
  const safePaths = paths.filter(
    (p) =>
      p &&
      typeof p === "string" &&
      !p.includes("..") &&
      !p.includes("//") &&
      STORAGE_ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix))
  );

  if (safePaths.length === 0) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      console.warn("[deleteTrainingAssets] No session token, skipping delete");
      return;
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const fnUrl = `https://${projectId}.supabase.co/functions/v1/training-assets-delete`;

    const baseBody = { paths: safePaths, reason, entity: entity || undefined };

    // Шаг 1: dry_run — проверяем что будет удалено и ownership
    const dryRes = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...baseBody, mode: "dry_run" }),
    });
    const dryData = await dryRes.json().catch(() => null);

    // BUGFIX: edge returns allowed_count / blocked_count (not allowed / blocked)
    if (!dryRes.ok || !dryData || dryData.allowed_count <= 0) {
      if (dryData?.allowed_count === 0 && dryData?.blocked_count > 0) {
        console.warn("[deleteTrainingAssets] Ownership mismatch — все пути заблокированы guard'ом, execute отменён. blocked_paths:", dryData.blocked_paths);
      } else if (!dryRes.ok) {
        console.error("[deleteTrainingAssets] dry_run failed:", dryData);
      }
      return;
    }

    // STOP: если ownership mismatch (часть путей заблокирована при наличии entity.id)
    if (entity?.id && dryData.allowed_count < safePaths.length) {
      console.warn(
        `[deleteTrainingAssets] Ownership mismatch: запрошено ${safePaths.length}, разрешено ${dryData.allowed_count}. blocked_paths:`, dryData.blocked_paths, "Execute отменён."
      );
      return;
    }

    // Шаг 2: execute — только если dry_run показал allowed > 0
    const execRes = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...baseBody, mode: "execute" }),
    });

    if (!execRes.ok) {
      const err = await execRes.text().catch(() => "unknown");
      console.error("[deleteTrainingAssets] Execute failed:", err);
    }
  } catch (err) {
    console.error("[deleteTrainingAssets] Failed:", err);
  }
}
