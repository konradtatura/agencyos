-- Daily EOD (End-of-Day) submissions for setters and closers

CREATE TABLE IF NOT EXISTS public.eod_submissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  for_date        date        NOT NULL,
  role            text        NOT NULL CHECK (role IN ('setter', 'closer')),

  -- ── Setter fields ──────────────────────────────────────────────────────────
  outbound_attempts     int,
  inbound_responses     int,
  booking_links_sent    int,
  good_convos           int,
  calls_booked          int,
  no_response_follows   int,
  top_3_wins            text,
  main_blocker          text,
  energy_level          int CHECK (energy_level BETWEEN 1 AND 10),
  notes_for_tomorrow    text,

  -- ── Closer fields ──────────────────────────────────────────────────────────
  scheduled_calls       int,
  calls_completed       int,
  no_shows              int,
  calls_closed          int,
  no_close_calls        int,
  rebooked_no_closes    int,
  disqualified          int,
  cash_collected        numeric(12,2),
  revenue_closed        numeric(12,2),
  payment_plans         int,
  full_pay              int,
  deposits_collected    numeric(12,2),
  no_close_reasons      text,
  no_show_reasons       text,
  coaching_needed_on    text,
  confidence_level      int CHECK (confidence_level BETWEEN 1 AND 10),
  need_script_review    boolean DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (submitted_by, for_date, role)
);

CREATE INDEX IF NOT EXISTS eod_submissions_submitted_by_idx ON public.eod_submissions (submitted_by);
CREATE INDEX IF NOT EXISTS eod_submissions_for_date_idx     ON public.eod_submissions (for_date);
CREATE INDEX IF NOT EXISTS eod_submissions_role_idx         ON public.eod_submissions (role);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_eod_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_eod_updated_at ON public.eod_submissions;
CREATE TRIGGER set_eod_updated_at
  BEFORE UPDATE ON public.eod_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_eod_updated_at();
