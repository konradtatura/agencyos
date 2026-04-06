-- Add funnel/analytics columns to tally_forms
ALTER TABLE public.tally_forms
  ADD COLUMN IF NOT EXISTS questions              jsonb,
  ADD COLUMN IF NOT EXISTS completed_submissions  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_submissions    int NOT NULL DEFAULT 0;

-- Add completion flag to submissions so we can filter completed vs partial
ALTER TABLE public.tally_submissions
  ADD COLUMN IF NOT EXISTS is_completed boolean;
