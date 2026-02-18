
-- PATCH E-1: Create public.get_db_now() to avoid runtime errors if called via RPC
CREATE OR REPLACE FUNCTION public.get_db_now()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT now()::timestamptz::text $$;

-- PATCH E-2: Fix current incident for walia_777 (user_id: 7764bce4-627f-4846-b366-0066ef8c4d6f)
-- Nullify active_until so sync no longer returns 'ok' from telegram_access
UPDATE telegram_access
SET
  state_chat    = 'revoked',
  state_channel = 'revoked',
  active_until  = NULL,
  last_sync_at  = now()
WHERE user_id = '7764bce4-627f-4846-b366-0066ef8c4d6f'
  AND club_id  = 'fa547c41-3a84-4c4f-904a-427332a0506e';

-- PATCH E-3: Mark telegram_club_members as 'no_access' so kick-violators cron sees it
UPDATE telegram_club_members
SET
  access_status = 'no_access',
  updated_at    = now()
WHERE id = '974e1b66-2d32-45ab-ab6f-14337d288c97';

-- Write audit record for this manual fix
INSERT INTO audit_logs (action, actor_type, actor_user_id, actor_label, target_user_id, meta)
VALUES (
  'telegram.incident_fix_walia_777',
  'system',
  NULL,
  'migration_patch_e',
  '7764bce4-627f-4846-b366-0066ef8c4d6f',
  '{"reason": "active_until was future despite revoked grants, causing sync to return ok", "fixed_fields": ["telegram_access.active_until=NULL", "telegram_access.state=revoked", "telegram_club_members.access_status=no_access"]}'::jsonb
);
