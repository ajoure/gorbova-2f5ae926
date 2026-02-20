
-- Create a secure function to manage news schedule cron jobs
CREATE OR REPLACE FUNCTION public.manage_news_cron(
  p_enabled BOOLEAN,
  p_morning_utc_hour INT,
  p_afternoon_utc_hour INT,
  p_monitor_url TEXT,
  p_service_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cron_morning TEXT;
  v_cron_afternoon TEXT;
  v_command TEXT;
BEGIN
  -- Unschedule existing jobs (ignore if not exist)
  BEGIN
    PERFORM cron.unschedule('monitor-news-morning');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.unschedule('monitor-news-afternoon');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Schedule new jobs if enabled
  IF p_enabled THEN
    v_cron_morning := '0 ' || p_morning_utc_hour || ' * * *';
    v_cron_afternoon := '0 ' || p_afternoon_utc_hour || ' * * *';

    v_command := 'SELECT net.http_post(url:=' || quote_literal(p_monitor_url)
      || ', headers:=' || quote_literal('{"Content-Type": "application/json", "Authorization": "Bearer ' || p_service_key || '"}')
      || '::jsonb, body:=' || quote_literal('{"limit": 10, "async": true}')
      || '::jsonb) as request_id;';

    PERFORM cron.schedule('monitor-news-morning', v_cron_morning, v_command);
    PERFORM cron.schedule('monitor-news-afternoon', v_cron_afternoon, v_command);
  END IF;
END;
$fn$;
