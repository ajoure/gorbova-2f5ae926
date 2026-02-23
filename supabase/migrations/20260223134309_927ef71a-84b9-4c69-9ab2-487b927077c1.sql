-- Разрешить любые типы файлов в training-assets bucket
-- Ранее был явный whitelist MIME, что блокировало XMind, Keynote и др.
-- file_size_limit оставляем 200MB без изменений
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'training-assets';