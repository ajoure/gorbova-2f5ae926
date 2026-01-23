-- Очередь для асинхронной обработки медиа
CREATE TABLE IF NOT EXISTS public.media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_db_id UUID NOT NULL REFERENCES public.telegram_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  bot_id UUID NOT NULL,
  telegram_file_id TEXT NOT NULL,
  file_type TEXT,
  file_name TEXT,
  attempts INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ok','error')),
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_pending
  ON public.media_jobs(status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.media_jobs ENABLE ROW LEVEL SECURITY;

-- Триггер updated_at (переиспользуемая функция)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_jobs_set_updated_at ON public.media_jobs;
CREATE TRIGGER trg_media_jobs_set_updated_at
BEFORE UPDATE ON public.media_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Разблокировка застрявших jobs (locked > N секунд)
CREATE OR REPLACE FUNCTION public.unlock_stuck_media_jobs(stuck_seconds INT DEFAULT 300)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.media_jobs
     SET status = 'pending', locked_at = NULL
   WHERE status = 'processing'
     AND locked_at IS NOT NULL
     AND locked_at < now() - make_interval(secs => stuck_seconds);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Атомарный claim через FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_media_jobs(p_limit INT DEFAULT 10, p_user_id UUID DEFAULT NULL)
RETURNS SETOF public.media_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT id FROM public.media_jobs
     WHERE status = 'pending' AND attempts < 3
       AND (p_user_id IS NULL OR user_id = p_user_id)
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(p_limit, 50))
  )
  UPDATE public.media_jobs j
     SET status = 'processing', locked_at = now(), attempts = attempts + 1
    FROM c WHERE j.id = c.id
  RETURNING j.*;
END;
$$;