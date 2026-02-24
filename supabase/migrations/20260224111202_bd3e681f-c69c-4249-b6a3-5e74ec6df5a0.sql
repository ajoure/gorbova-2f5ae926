
CREATE TABLE IF NOT EXISTS public.telegram_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.telegram_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_telegram_message_reactions_message_id
  ON public.telegram_message_reactions(message_id);

ALTER TABLE public.telegram_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view telegram reactions"
  ON public.telegram_message_reactions FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'superadmin']::public.app_role[])
  );

CREATE POLICY "Admins can add telegram reactions"
  ON public.telegram_message_reactions FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'superadmin']::public.app_role[])
    AND user_id = auth.uid()
  );

CREATE POLICY "Admins can remove own telegram reactions"
  ON public.telegram_message_reactions FOR DELETE
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'superadmin']::public.app_role[])
    AND user_id = auth.uid()
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_message_reactions;
