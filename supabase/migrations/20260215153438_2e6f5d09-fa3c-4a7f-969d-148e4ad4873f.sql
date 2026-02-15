-- Add email_inbox to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'email_inbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_inbox;
  END IF;
END $$;
