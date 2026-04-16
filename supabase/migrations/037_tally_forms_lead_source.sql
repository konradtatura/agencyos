-- Migration 037: add lead_source_type to tally_forms
-- Allows each form to tag newly created leads with the correct source
-- (e.g. 'vsl_funnel' for /brand, 'organic' for /aplikuj)

ALTER TABLE public.tally_forms
  ADD COLUMN IF NOT EXISTS lead_source_type text NOT NULL DEFAULT 'organic';
