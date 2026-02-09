
-- ============================================
-- PATCH P0.9.8: telegram_invite_links + telegram_club_members fields + expire cron
-- ============================================

-- A1: New table telegram_invite_links
CREATE TABLE IF NOT EXISTS public.telegram_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.telegram_clubs(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  telegram_user_id bigint NULL,
  invite_link text NOT NULL,
  invite_code text NOT NULL,
  target_type text NOT NULL DEFAULT 'chat',
  target_chat_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz NULL,
  used_at timestamptz NULL,
  used_by_telegram_user_id bigint NULL,
  expires_at timestamptz NOT NULL,
  member_limit int NOT NULL DEFAULT 1,
  source text NULL,
  source_id text NULL,
  note text NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_invite_links_club_profile 
  ON public.telegram_invite_links (club_id, profile_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_invite_links_code 
  ON public.telegram_invite_links (invite_code);
CREATE INDEX IF NOT EXISTS idx_telegram_invite_links_status_expires 
  ON public.telegram_invite_links (status, expires_at);

-- RLS
ALTER TABLE public.telegram_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access to telegram_invite_links"
  ON public.telegram_invite_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles_v2 ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.code IN ('admin', 'super_admin')
    )
  );

-- A2: New fields in telegram_club_members
ALTER TABLE public.telegram_club_members 
  ADD COLUMN IF NOT EXISTS last_invite_id uuid NULL REFERENCES public.telegram_invite_links(id),
  ADD COLUMN IF NOT EXISTS verified_in_chat_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS verified_in_channel_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz NULL;

-- A3: Function to expire stale invite links (batch 500)
CREATE OR REPLACE FUNCTION public.expire_stale_invite_links(batch_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  WITH expired AS (
    SELECT id FROM public.telegram_invite_links
    WHERE status IN ('created', 'sent')
      AND expires_at < now()
    ORDER BY expires_at
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.telegram_invite_links
  SET status = 'expired'
  WHERE id IN (SELECT id FROM expired);
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count > 0 THEN
    INSERT INTO public.audit_logs (action, actor_type, actor_user_id, meta)
    VALUES ('invite_links.expire_batch', 'system', NULL, jsonb_build_object('updated_count', updated_count));
  END IF;
  
  RETURN updated_count;
END;
$$;
