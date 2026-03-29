-- Add ghl_location_id to integrations table
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS ghl_location_id text;

CREATE INDEX IF NOT EXISTS integrations_ghl_location_id_idx
  ON public.integrations (ghl_location_id);

-- ── funnel_pageviews ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.funnel_pageviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid        REFERENCES public.creator_profiles(id) ON DELETE SET NULL,
  location_id text        NOT NULL,
  page_path   text        NOT NULL,
  page_name   text        NOT NULL DEFAULT '',
  session_id  text        NOT NULL,
  referrer    text        NOT NULL DEFAULT '',
  visited_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS funnel_pageviews_creator_visited_idx
  ON public.funnel_pageviews (creator_id, visited_at);

CREATE INDEX IF NOT EXISTS funnel_pageviews_location_visited_idx
  ON public.funnel_pageviews (location_id, visited_at);

-- Unique: one row per session + page (refreshes don't double-count)
CREATE UNIQUE INDEX IF NOT EXISTS funnel_pageviews_session_path_idx
  ON public.funnel_pageviews (session_id, page_path);

-- RLS
ALTER TABLE public.funnel_pageviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_read_funnel_pageviews"
  ON public.funnel_pageviews FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
    )
  );
