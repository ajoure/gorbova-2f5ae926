-- Таблица участников клуба (кэш из Telegram)
CREATE TABLE public.telegram_club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.telegram_clubs(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  in_chat boolean DEFAULT false,
  in_channel boolean DEFAULT false,
  joined_chat_at timestamp with time zone,
  joined_channel_at timestamp with time zone,
  -- Связь с нашей системой
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  link_status text NOT NULL DEFAULT 'not_linked', -- linked, not_linked
  access_status text NOT NULL DEFAULT 'unknown', -- ok, no_access, pending
  last_synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(club_id, telegram_user_id)
);

-- Таблица грантов доступа (история)
CREATE TABLE public.telegram_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  club_id uuid NOT NULL REFERENCES public.telegram_clubs(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual', -- order, payment, manual, subscription
  source_id uuid, -- order_id, payment_id, или null для manual
  granted_by uuid, -- admin who granted (for manual)
  start_at timestamp with time zone NOT NULL DEFAULT now(),
  end_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active', -- active, expired, revoked
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoke_reason text,
  meta jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Добавляем колонку last_members_sync_at в clubs
ALTER TABLE public.telegram_clubs 
ADD COLUMN IF NOT EXISTS last_members_sync_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS members_count_chat integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS members_count_channel integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS violators_count integer DEFAULT 0;

-- RLS для telegram_club_members
ALTER TABLE public.telegram_club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage club members"
ON public.telegram_club_members
FOR ALL
USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

-- RLS для telegram_access_grants
ALTER TABLE public.telegram_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage access grants"
ON public.telegram_access_grants
FOR ALL
USING (has_permission(auth.uid(), 'entitlements.manage'))
WITH CHECK (has_permission(auth.uid(), 'entitlements.manage'));

CREATE POLICY "Users can view own access grants"
ON public.telegram_access_grants
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger для обновления updated_at
CREATE TRIGGER update_telegram_club_members_updated_at
BEFORE UPDATE ON public.telegram_club_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_access_grants_updated_at
BEFORE UPDATE ON public.telegram_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Индексы для быстрого поиска
CREATE INDEX idx_telegram_club_members_club_id ON public.telegram_club_members(club_id);
CREATE INDEX idx_telegram_club_members_profile_id ON public.telegram_club_members(profile_id);
CREATE INDEX idx_telegram_club_members_access_status ON public.telegram_club_members(access_status);
CREATE INDEX idx_telegram_access_grants_user_id ON public.telegram_access_grants(user_id);
CREATE INDEX idx_telegram_access_grants_club_id ON public.telegram_access_grants(club_id);
CREATE INDEX idx_telegram_access_grants_status ON public.telegram_access_grants(status);