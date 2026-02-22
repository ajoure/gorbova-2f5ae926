ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS display_user_id uuid REFERENCES auth.users(id);