-- Create pending telegram notifications queue
CREATE TABLE public.pending_telegram_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_type TEXT NOT NULL, -- 'access_granted', 'invite_links', 'welcome', etc.
  club_id UUID REFERENCES public.telegram_clubs(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}', -- Contains message content, invite links, etc.
  priority INTEGER DEFAULT 0, -- Higher priority = send first
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT now(), -- When to send (for delayed messages)
  sent_at TIMESTAMP WITH TIME ZONE, -- NULL until sent
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'))
);

-- Add index for efficient querying
CREATE INDEX idx_pending_tg_notifications_user_status ON public.pending_telegram_notifications(user_id, status);
CREATE INDEX idx_pending_tg_notifications_scheduled ON public.pending_telegram_notifications(status, scheduled_for) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.pending_telegram_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own pending notifications
CREATE POLICY "Users can view own pending notifications" 
ON public.pending_telegram_notifications 
FOR SELECT 
USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role full access on pending notifications"
ON public.pending_telegram_notifications
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Function to queue notification if telegram not linked
CREATE OR REPLACE FUNCTION public.queue_telegram_notification(
  p_user_id UUID,
  p_notification_type TEXT,
  p_club_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}',
  p_priority INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_telegram_user_id BIGINT;
  v_notification_id UUID;
BEGIN
  -- Check if user has telegram linked
  SELECT telegram_user_id INTO v_telegram_user_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- If telegram linked, return NULL (caller should send directly)
  IF v_telegram_user_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  
  -- Queue the notification
  INSERT INTO public.pending_telegram_notifications (
    user_id, notification_type, club_id, payload, priority
  ) VALUES (
    p_user_id, p_notification_type, p_club_id, p_payload, p_priority
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to process pending notifications for a user (called when they link telegram)
CREATE OR REPLACE FUNCTION public.get_pending_notifications_for_user(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  notification_type TEXT,
  club_id UUID,
  payload JSONB,
  priority INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ptn.id,
    ptn.notification_type,
    ptn.club_id,
    ptn.payload,
    ptn.priority,
    ptn.created_at
  FROM public.pending_telegram_notifications ptn
  WHERE ptn.user_id = p_user_id
    AND ptn.status = 'pending'
    AND ptn.scheduled_for <= now()
  ORDER BY ptn.priority DESC, ptn.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add column to telegram_access to track pending invite state
ALTER TABLE public.telegram_access ADD COLUMN IF NOT EXISTS invites_pending BOOLEAN DEFAULT false;