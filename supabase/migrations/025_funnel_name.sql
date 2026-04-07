-- ============================================================================
-- AgencyOS — Add funnel_name to funnel_pageviews
-- ============================================================================

ALTER TABLE public.funnel_pageviews
  ADD COLUMN IF NOT EXISTS funnel_name text;
