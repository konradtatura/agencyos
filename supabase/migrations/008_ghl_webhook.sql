-- ============================================================================
-- AgencyOS — GHL Webhook: extend leads table for VSL funnel bookings
-- ============================================================================

-- Add tally_answers column for storing Tally/custom form data from GHL
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tally_answers jsonb,
  ADD COLUMN IF NOT EXISTS booked_at timestamptz;

-- Extend lead_source_type to include vsl_funnel
-- Drop old constraint, re-add with expanded values
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_lead_source_type_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_lead_source_type_check
  CHECK (lead_source_type IN ('story','reel','organic','manual','vsl_funnel'));
