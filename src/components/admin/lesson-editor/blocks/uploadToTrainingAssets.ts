import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Общая утилита загрузки файлов в бакет training-assets.
 * Использует тот же бакет и подход, что и ImageBlock.tsx.
 */
export async function uploadToTrainingAssets(
  file: File,
  folderPrefix: string,
  maxSizeMB: number,
  acceptMimePrefix?: string
): Promise<string | null> {
  // 1. Валидация типа ДО загрузки
  if (acceptMimePrefix && !file.type.startsWith(acceptMimePrefix)) {
    toast.error(`Неподдерживаемый формат файла`);
    return null;
  }

  // 2. Валидация размера ДО загрузки
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    toast.error(`Файл слишком большой. Максимум: ${maxSizeMB} МБ`);
    return null;
  }

  // 3. Уникальное имя файла (crypto.randomUUID + timestamp)
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
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

  // 4. Загрузка через тот же клиент что и ImageBlock
  const { error: uploadError } = await supabase.storage
    .from("training-assets")
    .upload(filePath, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    toast.error(`Ошибка загрузки: ${uploadError.message}`);
    return null;
  }

  // 5. Публичный URL (как в ImageBlock)
  const { data: urlData } = supabase.storage
    .from("training-assets")
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Преобразует Google Drive ссылку /file/d/ID/view → прямой URL.
 * Возвращает null если ссылка не является Google Drive.
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
