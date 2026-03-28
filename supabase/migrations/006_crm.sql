-- ============================================================================
-- AgencyOS — Sprint 6: CRM Lead Pipeline
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid          NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  name                 text          NOT NULL,
  ig_handle            text,
  email                text,
  phone                text,
  stage                text          NOT NULL DEFAULT 'dmd'
                                     CHECK (stage IN (
                                       'dmd','qualifying','qualified','call_booked','showed',
                                       'closed_won','closed_lost','follow_up','nurture',
                                       'disqualified','dead'
                                     )),
  offer_tier           text          CHECK (offer_tier IN ('ht','mt','lt')),
  pipeline_type        text          NOT NULL DEFAULT 'main'
                                     CHECK (pipeline_type IN ('main','downgrade')),
  downgrade_stage      text          CHECK (downgrade_stage IN ('offered','interested','booked','closed','dead')),
  assigned_setter_id   uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_closer_id   uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  deal_value           numeric(10,2),
  follow_up_date       date,
  lead_source_type     text          CHECK (lead_source_type IN ('story','reel','organic','manual')),
  lead_source_id       uuid,
  dm_conversation_id   uuid,
  ghl_contact_id       text,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_creator_stage_idx         ON public.leads (creator_id, stage);
CREATE INDEX IF NOT EXISTS leads_creator_pipeline_idx      ON public.leads (creator_id, pipeline_type);
CREATE INDEX IF NOT EXISTS leads_assigned_setter_idx       ON public.leads (assigned_setter_id);
CREATE INDEX IF NOT EXISTS leads_assigned_closer_idx       ON public.leads (assigned_closer_id);
CREATE INDEX IF NOT EXISTS leads_follow_up_date_idx        ON public.leads (follow_up_date);

CREATE OR REPLACE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. lead_stage_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage  text,
  to_stage    text        NOT NULL,
  changed_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

CREATE INDEX IF NOT EXISTS lead_stage_history_lead_changed_idx
  ON public.lead_stage_history (lead_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- 3. lead_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  note_text   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_created_idx
  ON public.lead_notes (lead_id, created_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes         ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- leads policies
-- ---------------------------------------------------------------------------

CREATE POLICY "leads: super_admin all"
  ON public.leads FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Creator sees all leads in their workspace.
CREATE POLICY "leads: creator read own"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "leads: creator write own"
  ON public.leads FOR ALL
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

-- Setter sees leads assigned to them.
CREATE POLICY "leads: setter read assigned"
  ON public.leads FOR SELECT
  TO authenticated
  USING (assigned_setter_id = (SELECT auth.uid()));

CREATE POLICY "leads: setter write assigned"
  ON public.leads FOR UPDATE
  TO authenticated
  USING     (assigned_setter_id = (SELECT auth.uid()))
  WITH CHECK (assigned_setter_id = (SELECT auth.uid()));

-- Closer sees leads assigned to them.
CREATE POLICY "leads: closer read assigned"
  ON public.leads FOR SELECT
  TO authenticated
  USING (assigned_closer_id = (SELECT auth.uid()));

CREATE POLICY "leads: closer write assigned"
  ON public.leads FOR UPDATE
  TO authenticated
  USING     (assigned_closer_id = (SELECT auth.uid()))
  WITH CHECK (assigned_closer_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- lead_stage_history policies (mirrors leads access)
-- ---------------------------------------------------------------------------

CREATE POLICY "lead_stage_history: super_admin all"
  ON public.lead_stage_history FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "lead_stage_history: creator read own"
  ON public.lead_stage_history FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT l.id FROM public.leads l
      JOIN   public.creator_profiles cp ON cp.id = l.creator_id
      WHERE  cp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_stage_history: creator write own"
  ON public.lead_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT l.id FROM public.leads l
      JOIN   public.creator_profiles cp ON cp.id = l.creator_id
      WHERE  cp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_stage_history: setter read assigned"
  ON public.lead_stage_history FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_setter_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_stage_history: setter insert assigned"
  ON public.lead_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_setter_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_stage_history: closer read assigned"
  ON public.lead_stage_history FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_closer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_stage_history: closer insert assigned"
  ON public.lead_stage_history FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_closer_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- lead_notes policies (mirrors leads access; any team member with access can INSERT)
-- ---------------------------------------------------------------------------

CREATE POLICY "lead_notes: super_admin all"
  ON public.lead_notes FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "lead_notes: creator read own"
  ON public.lead_notes FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT l.id FROM public.leads l
      JOIN   public.creator_profiles cp ON cp.id = l.creator_id
      WHERE  cp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_notes: creator write own"
  ON public.lead_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT l.id FROM public.leads l
      JOIN   public.creator_profiles cp ON cp.id = l.creator_id
      WHERE  cp.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_notes: setter read assigned"
  ON public.lead_notes FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_setter_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_notes: setter insert assigned"
  ON public.lead_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_setter_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_notes: closer read assigned"
  ON public.lead_notes FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_closer_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_notes: closer insert assigned"
  ON public.lead_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE  assigned_closer_id = (SELECT auth.uid())
    )
  );
