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
 * Это важно для форматов с нестандартным file.type (m4a, xlsx и т.д.)
 *
 * @param file            — загружаемый файл
 * @param folderPrefix    — папка внутри бакета (например "lesson-audio")
 * @param maxSizeMB       — максимальный размер в МБ
 * @param acceptMimePrefix — опциональный MIME-префикс для фильтрации (например "audio/", "image/")
 * @param allowedExtensions — опциональный allowlist расширений (например [".mp3", ".wav"])
 */
export async function uploadToTrainingAssets(
  file: File,
  folderPrefix: string,
  maxSizeMB: number,
  acceptMimePrefix?: string,
  allowedExtensions?: string[]
): Promise<string | null> {
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

  // Уникальное имя файла (crypto.randomUUID + timestamp)
  const uniqueId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2);

  // Безопасное имя файла — убираем спецсимволы, оставляем расширение
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 64);

  const filePath = `${folderPrefix}/${Date.now()}-${uniqueId}-${safeName}`;

  // Определяем Content-Type: fallback по расширению если file.type пустой
  const resolvedContentType = file.type || extensionToMime(fileExtension);

  // Загрузка через Supabase Storage (как в ImageBlock)
  const { error: uploadError } = await supabase.storage
    .from("training-assets")
    .upload(filePath, file, { upsert: false, contentType: resolvedContentType });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    toast.error(`Ошибка загрузки: ${uploadError.message}`);
    return null;
  }

  // Публичный URL (как в ImageBlock)
  const { data: urlData } = supabase.storage
    .from("training-assets")
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Преобразует Google Drive ссылку /file/d/ID/view → прямой URL для скачивания.
 * Возвращает null если ссылка не является Google Drive.
 *
 * ВАЖНО: Google Drive uc?export=download не гарантирует audio-stream.
 * Используйте только как ссылку для скачивания, не для <audio src>.
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
