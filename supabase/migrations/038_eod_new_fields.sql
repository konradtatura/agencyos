-- New setter fields for simplified EOD form
ALTER TABLE public.eod_submissions
  ADD COLUMN IF NOT EXISTS outbound_sent        int,
  ADD COLUMN IF NOT EXISTS inbound_received     int,
  ADD COLUMN IF NOT EXISTS outbound_booked_q    int,
  ADD COLUMN IF NOT EXISTS inbound_booked_q     int,
  ADD COLUMN IF NOT EXISTS dq_forms             int,
  ADD COLUMN IF NOT EXISTS downsell_cash        numeric(12,2);

-- New closer fields for simplified EOD form
ALTER TABLE public.eod_submissions
  ADD COLUMN IF NOT EXISTS showed               int,
  ADD COLUMN IF NOT EXISTS canceled             int,
  ADD COLUMN IF NOT EXISTS rescheduled          int,
  ADD COLUMN IF NOT EXISTS followup_shown       int,
  ADD COLUMN IF NOT EXISTS followup_closed      int,
  ADD COLUMN IF NOT EXISTS closes               int,
  ADD COLUMN IF NOT EXISTS revenue              numeric(12,2);
