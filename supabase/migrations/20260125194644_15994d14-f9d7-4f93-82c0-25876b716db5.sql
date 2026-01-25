-- ЧАСТЬ 1: Grace Period поля в subscriptions_v2
ALTER TABLE public.subscriptions_v2 
ADD COLUMN IF NOT EXISTS grace_period_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS grace_period_status TEXT;

COMMENT ON COLUMN public.subscriptions_v2.grace_period_status IS 
  'NULL=active, in_grace=72h window for old price, expired_reentry=manual payment only';

-- ЧАСТЬ 2: reentry pricing в profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS reentry_pricing_applies_from TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.reentry_pricing_applies_from IS 
  'Timestamp when reentry (higher) pricing starts applying after grace period expired';

-- ЧАСТЬ 3: Таблица для idempotency уведомлений grace period
CREATE TABLE IF NOT EXISTS public.grace_notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions_v2(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel TEXT NOT NULL DEFAULT 'telegram', -- 'telegram' | 'email'
  meta JSONB DEFAULT '{}',
  UNIQUE(subscription_id, event_type, channel)
);

-- RLS для grace_notification_events
ALTER TABLE public.grace_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage grace_notification_events"
ON public.grace_notification_events
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Admins can view grace_notification_events"
ON public.grace_notification_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles_v2 ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
    AND r.name IN ('admin', 'super_admin')
  )
);

-- ЧАСТЬ 4: Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_status 
ON subscriptions_v2(grace_period_status) WHERE grace_period_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_ends 
ON subscriptions_v2(grace_period_ends_at) WHERE grace_period_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grace_notification_events_sub 
ON grace_notification_events(subscription_id);

-- ЧАСТЬ 5: Индекс для поиска подписок для grace cron
CREATE INDEX IF NOT EXISTS idx_subscriptions_access_end_auto_renew 
ON subscriptions_v2(access_end_at, auto_renew) 
WHERE auto_renew = true AND status IN ('active', 'trial', 'past_due');