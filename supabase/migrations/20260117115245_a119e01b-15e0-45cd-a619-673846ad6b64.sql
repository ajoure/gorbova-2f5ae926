-- Add Gorbova Club channel to telegram_publish_channels
-- Using 'news' for main channel and 'digest' for chat
INSERT INTO public.telegram_publish_channels (
  id,
  channel_id,
  channel_name,
  channel_type,
  bot_id,
  is_active,
  settings
) VALUES 
(
  gen_random_uuid(),
  '-1001791889721',
  'Горбова Клуб (Канал)',
  'news',
  '1a560e98-574e-4fd9-82ab-4b7bbdc300b4',
  true,
  '{"style_profile": null}'::jsonb
),
(
  gen_random_uuid(),
  '-1001686262735',
  'Горбова Клуб (Чат)',
  'digest',
  '1a560e98-574e-4fd9-82ab-4b7bbdc300b4',
  true,
  '{"style_profile": null}'::jsonb
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_publish_channels_active 
ON public.telegram_publish_channels(is_active) 
WHERE is_active = true;