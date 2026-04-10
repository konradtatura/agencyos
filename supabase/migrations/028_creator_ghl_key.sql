-- Move GHL API key to per-creator level
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS ghl_api_key text;
