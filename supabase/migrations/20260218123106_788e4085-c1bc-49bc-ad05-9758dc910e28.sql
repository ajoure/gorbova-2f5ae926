
-- Обновляем бакет training-assets: добавляем аудио, документы и поднимаем лимит до 200 МБ
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    -- Изображения (были)
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    -- Аудио
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/x-m4a',
    'audio/x-wav',
    -- Документы
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-rar-compressed',
    'text/plain',
    'text/csv',
    'application/rtf',
    -- Fallback для нестандартных типов
    'application/octet-stream'
  ],
  file_size_limit = 209715200  -- 200 МБ
WHERE id = 'training-assets';
