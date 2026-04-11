-- Backfill missing column from 026 that was added to the migration file
-- after the table was already created in production.
ALTER TABLE public.eod_submissions
  ADD COLUMN IF NOT EXISTS good_convos int;
