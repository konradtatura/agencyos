-- Clear tally_submissions again to re-sync with corrected responses parser.
-- Previous sync stored empty answers because responses is keyed by numeric
-- index ("0","1"...) with entry.questionId inside, not directly by questionId.
DELETE FROM public.tally_submissions;
