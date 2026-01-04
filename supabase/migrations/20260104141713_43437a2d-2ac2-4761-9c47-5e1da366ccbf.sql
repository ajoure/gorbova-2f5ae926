-- Add Telegram fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS telegram_user_id bigint UNIQUE,
ADD COLUMN IF NOT EXISTS telegram_username text,
ADD COLUMN IF NOT EXISTS telegram_linked_at timestamp with time zone;

-- Create index for telegram_user_id lookup
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_user_id ON public.profiles(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

-- Table for Telegram bots (multi-bot support)
CREATE TABLE public.telegram_bots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_name text NOT NULL,
  bot_username text NOT NULL UNIQUE,
  bot_token_encrypted text NOT NULL,
  bot_id bigint,
  status text NOT NULL DEFAULT 'active',
  last_check_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage telegram bots" ON public.telegram_bots
FOR ALL USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- Table for Telegram clubs (chat + channel pairs)
CREATE TABLE public.telegram_clubs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_name text NOT NULL,
  bot_id uuid NOT NULL REFERENCES public.telegram_bots(id) ON DELETE CASCADE,
  chat_id bigint,
  chat_invite_link text,
  chat_status text DEFAULT 'pending',
  channel_id bigint,
  channel_invite_link text,
  channel_status text DEFAULT 'pending',
  access_mode text NOT NULL DEFAULT 'AUTO_WITH_FALLBACK',
  revoke_mode text NOT NULL DEFAULT 'KICK_ONLY',
  subscription_duration_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage telegram clubs" ON public.telegram_clubs
FOR ALL USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- Table for link tokens (one-time tokens for Telegram linking)
CREATE TABLE public.telegram_link_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own link tokens" ON public.telegram_link_tokens
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own link tokens" ON public.telegram_link_tokens
FOR SELECT USING (auth.uid() = user_id);

-- Table for user access state per club
CREATE TABLE public.telegram_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.telegram_clubs(id) ON DELETE CASCADE,
  state_chat text NOT NULL DEFAULT 'none',
  state_channel text NOT NULL DEFAULT 'none',
  active_until timestamp with time zone,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, club_id)
);

ALTER TABLE public.telegram_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telegram access" ON public.telegram_access
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage telegram access" ON public.telegram_access
FOR ALL USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- Table for manual/privileged access
CREATE TABLE public.telegram_manual_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.telegram_clubs(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  valid_until timestamp with time zone,
  comment text,
  created_by_admin_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, club_id)
);

ALTER TABLE public.telegram_manual_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage manual access" ON public.telegram_manual_access
FOR ALL USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- Table for Telegram action logs
CREATE TABLE public.telegram_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid REFERENCES public.telegram_clubs(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  status text NOT NULL,
  error_message text,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view telegram logs" ON public.telegram_logs
FOR SELECT USING (has_permission(auth.uid(), 'entitlements.manage'));

CREATE POLICY "System can insert telegram logs" ON public.telegram_logs
FOR INSERT WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_telegram_bots_updated_at
  BEFORE UPDATE ON public.telegram_bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_clubs_updated_at
  BEFORE UPDATE ON public.telegram_clubs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_access_updated_at
  BEFORE UPDATE ON public.telegram_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_manual_access_updated_at
  BEFORE UPDATE ON public.telegram_manual_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();