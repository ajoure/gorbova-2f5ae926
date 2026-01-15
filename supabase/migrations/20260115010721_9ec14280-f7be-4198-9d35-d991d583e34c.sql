-- PATCH 13: Add onboarding persistence fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.profiles.onboarding_dismissed_at IS 'When user clicked "Remind me later" on onboarding modal';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS 'When user completed onboarding (clicked "Done")';