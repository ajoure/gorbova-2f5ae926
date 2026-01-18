-- Add communication_style JSONB column to profiles table for storing AI recommendations
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS communication_style JSONB;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.communication_style IS 'AI-generated communication recommendations: tone, keywords_to_use, topics_to_avoid, recommendations';