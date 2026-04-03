-- ============================================================================
-- AgencyOS — Tally Integration
-- Tables: tally_api_keys, tally_forms, tally_submissions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tally_api_keys  (one row per creator)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tally_api_keys (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id         uuid        NOT NULL UNIQUE REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  api_key_encrypted  text        NOT NULL,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  last_validated_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- 2. tally_forms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tally_forms (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  tally_form_id         text        NOT NULL UNIQUE,
  name                  text,
  workspace_name        text,
  is_qualification_form boolean     NOT NULL DEFAULT false,
  total_submissions     int         NOT NULL DEFAULT 0,
  last_synced_at        timestamptz,
  active                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tally_forms_creator_idx ON public.tally_forms (creator_id);

-- ---------------------------------------------------------------------------
-- 3. tally_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tally_submissions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  form_id               uuid        REFERENCES public.tally_forms(id) ON DELETE CASCADE,
  tally_submission_id   text        NOT NULL UNIQUE,
  answers               jsonb,
  respondent_name       text,
  respondent_phone      text,
  respondent_ig_handle  text,
  submitted_at          timestamptz,
  lead_id               uuid        REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tally_submissions_creator_idx    ON public.tally_submissions (creator_id);
CREATE INDEX IF NOT EXISTS tally_submissions_form_idx       ON public.tally_submissions (form_id);
CREATE INDEX IF NOT EXISTS tally_submissions_submitted_idx  ON public.tally_submissions (submitted_at DESC);
CREATE INDEX IF NOT EXISTS tally_submissions_lead_idx       ON public.tally_submissions (lead_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.tally_api_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_forms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_submissions ENABLE ROW LEVEL SECURITY;

-- Helper: resolve creator_profiles.id for the calling user
-- (reuses the pattern from 006_crm.sql)

-- ---------------------------------------------------------------------------
-- tally_api_keys policies
-- ---------------------------------------------------------------------------

CREATE POLICY "tally_api_keys: creator own"
  ON public.tally_api_keys FOR ALL
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

-- ---------------------------------------------------------------------------
-- tally_forms policies
-- ---------------------------------------------------------------------------

CREATE POLICY "tally_forms: creator own"
  ON public.tally_forms FOR ALL
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

-- ---------------------------------------------------------------------------
-- tally_submissions policies
-- ---------------------------------------------------------------------------

CREATE POLICY "tally_submissions: creator own"
  ON public.tally_submissions FOR ALL
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
