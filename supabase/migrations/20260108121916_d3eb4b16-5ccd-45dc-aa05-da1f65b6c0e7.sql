-- Table for storing all email communications (sent and received)
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- target user
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  template_code TEXT, -- if sent from template
  provider TEXT, -- 'resend', 'smtp', etc.
  provider_message_id TEXT, -- external ID from email provider
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')),
  error_message TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE
);

-- Table for storing Telegram chat messages between admin and users
CREATE TABLE public.telegram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, -- the user we're communicating with
  telegram_user_id BIGINT NOT NULL, -- their telegram ID
  bot_id UUID REFERENCES public.telegram_bots(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  message_text TEXT,
  message_id BIGINT, -- telegram message_id for replies
  reply_to_message_id BIGINT,
  sent_by_admin UUID, -- admin who sent the message
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read')),
  error_message TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_email_logs_user_id ON public.email_logs(user_id);
CREATE INDEX idx_email_logs_profile_id ON public.email_logs(profile_id);
CREATE INDEX idx_email_logs_to_email ON public.email_logs(to_email);
CREATE INDEX idx_email_logs_created_at ON public.email_logs(created_at DESC);

CREATE INDEX idx_telegram_messages_user_id ON public.telegram_messages(user_id);
CREATE INDEX idx_telegram_messages_telegram_user_id ON public.telegram_messages(telegram_user_id);
CREATE INDEX idx_telegram_messages_created_at ON public.telegram_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins can access
CREATE POLICY "Admins can view all email logs"
  ON public.email_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert email logs"
  ON public.email_logs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all telegram messages"
  ON public.telegram_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert telegram messages"
  ON public.telegram_messages FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow service role full access for edge functions
CREATE POLICY "Service role full access to email logs"
  ON public.email_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to telegram messages"
  ON public.telegram_messages FOR ALL
  USING (auth.role() = 'service_role');