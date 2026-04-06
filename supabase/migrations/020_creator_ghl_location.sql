-- Add GHL Location ID to creator_profiles
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ghl_location_id text;
