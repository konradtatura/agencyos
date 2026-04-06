-- Add GHL API key (agency-level) to agency_config
ALTER TABLE public.agency_config
  ADD COLUMN IF NOT EXISTS ghl_api_key TEXT;
