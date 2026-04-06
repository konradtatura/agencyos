-- ============================================================================
-- AgencyOS — Dynamic pipeline stages
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop hardcoded CHECK constraints on leads so stages are fully dynamic
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_downgrade_stage_check;

-- Add vsl_funnel to lead_source_type (rebuild the check)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_source_type_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lead_source_type_check
  CHECK (lead_source_type IN ('story','reel','organic','manual','vsl_funnel'));

-- ---------------------------------------------------------------------------
-- 2. pipeline_stages — per-creator ordered stage definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  pipeline_type text        NOT NULL DEFAULT 'main'
                            CHECK (pipeline_type IN ('main','downgrade')),
  name          text        NOT NULL,
  color         text        NOT NULL DEFAULT '#6b7280',
  position      integer     NOT NULL DEFAULT 0,
  is_won        boolean     NOT NULL DEFAULT false,
  is_lost       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, pipeline_type, name)
);

CREATE INDEX IF NOT EXISTS pipeline_stages_creator_type_pos_idx
  ON public.pipeline_stages (creator_id, pipeline_type, position);

-- ---------------------------------------------------------------------------
-- 3. Seed default stages for every existing creator_profile
-- ---------------------------------------------------------------------------
INSERT INTO public.pipeline_stages (creator_id, pipeline_type, name, color, position, is_won, is_lost)
SELECT
  cp.id,
  'main'        AS pipeline_type,
  s.name,
  s.color,
  s.position,
  s.is_won,
  s.is_lost
FROM public.creator_profiles cp
CROSS JOIN (VALUES
  ('dmd',         '#6366f1', 0, false, false),
  ('qualifying',  '#8b5cf6', 1, false, false),
  ('qualified',   '#2563eb', 2, false, false),
  ('call_booked', '#0ea5e9', 3, false, false),
  ('showed',      '#f59e0b', 4, false, false),
  ('closed_won',  '#10b981', 5, true,  false),
  ('closed_lost', '#ef4444', 6, false, true),
  ('follow_up',   '#f97316', 7, false, false),
  ('nurture',     '#14b8a6', 8, false, false)
) AS s(name, color, position, is_won, is_lost)
ON CONFLICT (creator_id, pipeline_type, name) DO NOTHING;

INSERT INTO public.pipeline_stages (creator_id, pipeline_type, name, color, position, is_won, is_lost)
SELECT
  cp.id,
  'downgrade'   AS pipeline_type,
  s.name,
  s.color,
  s.position,
  s.is_won,
  s.is_lost
FROM public.creator_profiles cp
CROSS JOIN (VALUES
  ('offered',    '#6366f1', 0, false, false),
  ('interested', '#8b5cf6', 1, false, false),
  ('booked',     '#f59e0b', 2, false, false),
  ('closed',     '#10b981', 3, true,  false),
  ('dead',       '#4b5563', 4, false, true)
) AS s(name, color, position, is_won, is_lost)
ON CONFLICT (creator_id, pipeline_type, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages: super_admin all"
  ON public.pipeline_stages FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "pipeline_stages: creator read own"
  ON public.pipeline_stages FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "pipeline_stages: creator write own"
  ON public.pipeline_stages FOR ALL
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );
