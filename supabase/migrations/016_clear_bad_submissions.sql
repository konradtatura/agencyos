-- Clear all tally_submissions rows that were saved with malformed answers
-- ({"undefined": null}) due to the extractSubmissions bug that returned
-- the questions array instead of the submissions array.
-- A fresh sync will repopulate with correctly parsed answers.
DELETE FROM public.tally_submissions;
