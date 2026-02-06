-- Fix RLS: allow admin/superadmin to manage ai_bot_settings
DROP POLICY IF EXISTS "Service role only" ON ai_bot_settings;

-- Allow admins to read/write
CREATE POLICY "Admins can manage ai_bot_settings" 
ON ai_bot_settings 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'superadmin')
  )
);

-- Service role also needs access for edge functions
CREATE POLICY "Service role full access" 
ON ai_bot_settings 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- Add columns for bot identity and master switch
ALTER TABLE ai_bot_settings 
ADD COLUMN IF NOT EXISTS bot_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS bot_name text DEFAULT 'Олег',
ADD COLUMN IF NOT EXISTS bot_position text DEFAULT 'AI-ассистент поддержки';