-- Make creator_id nullable on tally_submissions so forms can be synced
-- at agency level before being assigned to a specific creator.
ALTER TABLE public.tally_submissions
  ALTER COLUMN creator_id DROP NOT NULL;
