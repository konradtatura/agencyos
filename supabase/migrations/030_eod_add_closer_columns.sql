-- Backfill closer columns from 026 that were added to the migration file
-- after the table was already created in production.
ALTER TABLE public.eod_submissions
  ADD COLUMN IF NOT EXISTS no_close_reasons  text,
  ADD COLUMN IF NOT EXISTS no_show_reasons   text,
  ADD COLUMN IF NOT EXISTS coaching_needed_on text,
  ADD COLUMN IF NOT EXISTS confidence_level  int CHECK (confidence_level BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS need_script_review boolean DEFAULT false;
