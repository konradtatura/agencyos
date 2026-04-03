-- Clear all tally_submissions so the next sync repopulates them
-- using the corrected responses-dict parser (submission.responses keyed by questionId).
DELETE FROM public.tally_submissions;
