
-- PATCH P2: webhook_events table + indexes + RLS + orphans processed_by

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text,
  transaction_uid text,
  subscription_id text,
  tracking_id text,
  parsed_kind text,
  parsed_order_id uuid,
  outcome text NOT NULL,
  http_status int,
  processing_ms int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_tx_uid ON public.webhook_events(provider, transaction_uid);
CREATE INDEX idx_webhook_events_outcome_time ON public.webhook_events(provider, outcome, created_at DESC);
CREATE INDEX idx_webhook_events_order_id ON public.webhook_events(provider, parsed_order_id);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_admin_select
  ON public.webhook_events
  FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin','superadmin']::app_role[]));

ALTER TABLE public.provider_webhook_orphans
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id);
