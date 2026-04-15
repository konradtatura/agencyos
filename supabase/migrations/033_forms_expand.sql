-- Expand eod_submissions with setter v2, closer v2, and sales_admin columns.
-- All ADD COLUMN IF NOT EXISTS — safe to run against an existing table.

ALTER TABLE public.eod_submissions

  -- ── Setter v2 ─────────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS inbound_dms_received      int,
  ADD COLUMN IF NOT EXISTS calls_booked_inbound      int,
  ADD COLUMN IF NOT EXISTS calls_booked_outbound     int,
  ADD COLUMN IF NOT EXISTS hours_worked              numeric(4,2),
  ADD COLUMN IF NOT EXISTS convo_upload_urls         text[],

  -- ── Closer v2 ─────────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS calls_booked_today        int,
  ADD COLUMN IF NOT EXISTS showed                    int,
  ADD COLUMN IF NOT EXISTS cancelled                 int,
  ADD COLUMN IF NOT EXISTS rescheduled               int,
  ADD COLUMN IF NOT EXISTS calls_taken               int,
  ADD COLUMN IF NOT EXISTS offers_made               int,
  ADD COLUMN IF NOT EXISTS closes                    int,
  ADD COLUMN IF NOT EXISTS deposits_collected_count  int,
  ADD COLUMN IF NOT EXISTS disqualified_count        int,
  ADD COLUMN IF NOT EXISTS followup_calls_booked     int,
  ADD COLUMN IF NOT EXISTS followup_calls_shown      int,
  ADD COLUMN IF NOT EXISTS followup_payments_hunted  int,
  ADD COLUMN IF NOT EXISTS cash_collected_v2         numeric(12,2),
  ADD COLUMN IF NOT EXISTS deposits_cash             numeric(12,2),
  ADD COLUMN IF NOT EXISTS followup_payments_cash    numeric(12,2),
  ADD COLUMN IF NOT EXISTS revenue_generated         numeric(12,2),
  ADD COLUMN IF NOT EXISTS crm_updated               boolean,
  ADD COLUMN IF NOT EXISTS crm_not_updated_reason    text,

  -- ── Calculated rates (stored for fast reads) ──────────────────────────────
  ADD COLUMN IF NOT EXISTS calc_close_rate           numeric(5,2),
  ADD COLUMN IF NOT EXISTS calc_no_show_rate         numeric(5,2),
  ADD COLUMN IF NOT EXISTS calc_cancel_rate          numeric(5,2),
  ADD COLUMN IF NOT EXISTS calc_dq_rate              numeric(5,2),
  ADD COLUMN IF NOT EXISTS calc_show_rate            numeric(5,2),
  ADD COLUMN IF NOT EXISTS calc_offer_rate           numeric(5,2),
  ADD COLUMN IF NOT EXISTS calc_aov                  numeric(12,2),

  -- ── Week grouping ─────────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS week_number               int,
  ADD COLUMN IF NOT EXISTS week_range                text,

  -- ── Sales admin columns ───────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS sa_confirmation_dials     int,
  ADD COLUMN IF NOT EXISTS sa_picked_up              int,
  ADD COLUMN IF NOT EXISTS sa_calls_confirmed        int,
  ADD COLUMN IF NOT EXISTS sa_notes                  text;

-- ── Extend role check constraint to include sales_admin ───────────────────────
-- Drop the old constraint and recreate with the new allowed value.
ALTER TABLE public.eod_submissions
  DROP CONSTRAINT IF EXISTS eod_submissions_role_check;

ALTER TABLE public.eod_submissions
  ADD CONSTRAINT eod_submissions_role_check
    CHECK (role IN ('setter', 'closer', 'sales_admin'));
