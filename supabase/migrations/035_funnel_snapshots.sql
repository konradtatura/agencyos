-- ============================================================================
-- AgencyOS — VSL Funnel snapshot tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.funnel_snapshots (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid        REFERENCES public.creator_profiles(id),
  funnel_name          text        NOT NULL,
  date_from            date,
  date_to              date,

  -- Ad spend / traffic
  meta_spend           numeric     DEFAULT 0,
  meta_impressions     int         DEFAULT 0,
  meta_clicks          int         DEFAULT 0,

  -- Funnel steps
  lp_views             int         DEFAULT 0,
  opt_ins              int         DEFAULT 0,
  application_views    int         DEFAULT 0,
  applications         int         DEFAULT 0,
  book_call_views      int         DEFAULT 0,
  calls_booked_paid    int         DEFAULT 0,  -- from paid traffic
  calls_booked_crm     int         DEFAULT 0,  -- source of truth from CRM

  -- Downsells
  downsell1_name       text,
  downsell1_views      int         DEFAULT 0,
  downsell1_buyers     int         DEFAULT 0,
  downsell1_revenue    numeric     DEFAULT 0,

  downsell2_name       text,
  downsell2_views      int         DEFAULT 0,
  downsell2_buyers     int         DEFAULT 0,
  downsell2_revenue    numeric     DEFAULT 0,

  -- Outcome
  total_revenue        numeric     DEFAULT 0,
  notes                text,

  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funnel_snapshots_creator_idx  ON public.funnel_snapshots (creator_id);
CREATE INDEX IF NOT EXISTS funnel_snapshots_date_idx     ON public.funnel_snapshots (date_from);

ALTER TABLE public.funnel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_funnel_snapshots" ON public.funnel_snapshots
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "creator_own_funnel_snapshots" ON public.funnel_snapshots
  FOR ALL USING (
    creator_id = (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid() LIMIT 1)
  );
