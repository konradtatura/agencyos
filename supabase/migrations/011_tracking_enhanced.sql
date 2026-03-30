-- ── Enhanced tracking columns on funnel_pageviews ──────────────────────────

ALTER TABLE public.funnel_pageviews
  ADD COLUMN IF NOT EXISTS device_type      varchar,
  ADD COLUMN IF NOT EXISTS referrer_source  varchar;

-- ── page_leave_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.page_leave_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            text        NOT NULL,
  page_path             text        NOT NULL,
  time_on_page_seconds  integer     NOT NULL DEFAULT 0,
  recorded_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_leave_events_session_idx
  ON public.page_leave_events (session_id);

-- RLS
ALTER TABLE public.page_leave_events ENABLE ROW LEVEL SECURITY;

-- No select policy needed for public write-only table;
-- reads happen server-side via admin client.
