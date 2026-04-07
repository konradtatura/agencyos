-- ============================================================================
-- AgencyOS — Add whop_company_id to creator_profiles
-- ============================================================================

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS whop_company_id TEXT;
