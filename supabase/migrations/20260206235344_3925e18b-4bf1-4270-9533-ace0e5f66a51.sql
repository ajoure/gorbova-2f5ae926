-- ==============================================
-- AI Oleg Bot v2: Production-Grade Fixes (CORRECTED)
-- ==============================================

-- 1. Добавить last_greeted_date для приветствия 1 раз в день
ALTER TABLE telegram_ai_conversations 
ADD COLUMN IF NOT EXISTS last_greeted_date date;

-- 2. Добавить новые настройки в ai_bot_settings (add-only)
ALTER TABLE ai_bot_settings
ADD COLUMN IF NOT EXISTS handoff_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS admin_notify_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS admin_notify_mode text DEFAULT 'inbox',
ADD COLUMN IF NOT EXISTS admin_notify_targets jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS unknown_policy text DEFAULT 'ask_clarify',
ADD COLUMN IF NOT EXISTS anger_policy text DEFAULT 'deescalate_then_handoff',
ADD COLUMN IF NOT EXISTS max_handoff_per_hour integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_handoff_per_day integer DEFAULT 8,
ADD COLUMN IF NOT EXISTS hold_ai_when_handoff_open boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS greeting_policy text DEFAULT 'once_per_day',
ADD COLUMN IF NOT EXISTS name_usage_policy text DEFAULT 'rare',
ADD COLUMN IF NOT EXISTS followup_cooldown_minutes integer DEFAULT 180,
ADD COLUMN IF NOT EXISTS followup_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS payment_link_limit_per_10min integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS message_limit_per_minute integer DEFAULT 10;

-- 3. Исправить структуру telegram_ai_processed_messages (если нужен unique constraint)
-- Таблица уже существует с telegram_message_id, добавим уникальный индекс если нет
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_processed_unique 
ON telegram_ai_processed_messages(bot_id, telegram_user_id, telegram_message_id);

-- 4. Таблица админ-уведомлений
CREATE TABLE IF NOT EXISTS ai_admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid REFERENCES telegram_bots(id),
  telegram_user_id bigint NOT NULL,
  handoff_id uuid REFERENCES ai_handoffs(id),
  status text DEFAULT 'new' CHECK (status IN ('new','sent','acked','failed')),
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_admin_notif_status 
ON ai_admin_notifications(status, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_admin_notif_bot 
ON ai_admin_notifications(bot_id, created_at DESC);

ALTER TABLE ai_admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON ai_admin_notifications;
CREATE POLICY "Service role only" ON ai_admin_notifications 
FOR ALL TO service_role USING (true);

-- 5. RLS для ai_rate_limits
ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON ai_rate_limits;
CREATE POLICY "Service role only" ON ai_rate_limits 
FOR ALL TO service_role USING (true);

-- 6. RLS для telegram_ai_processed_messages
ALTER TABLE telegram_ai_processed_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON telegram_ai_processed_messages;
CREATE POLICY "Service role only" ON telegram_ai_processed_messages 
FOR ALL TO service_role USING (true);