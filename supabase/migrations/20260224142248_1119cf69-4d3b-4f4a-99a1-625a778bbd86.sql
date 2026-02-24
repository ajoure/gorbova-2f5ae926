
-- Idempotent FK: lesson_progress.user_id → profiles(user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_progress_user_id_fkey'
  ) THEN
    ALTER TABLE public.lesson_progress
      ADD CONSTRAINT lesson_progress_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
      ON DELETE NO ACTION;
  END IF;
END $$;
