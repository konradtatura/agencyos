-- ============================================================================
-- AgencyOS — Agency-level settings + Tally form assignment rework
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. agency_settings  (generic key-value store for agency-wide config)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_settings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text        NOT NULL UNIQUE,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER agency_settings_updated_at
  BEFORE UPDATE ON public.agency_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read/write agency settings
CREATE POLICY "agency_settings: super_admin all"
  ON public.agency_settings FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2. tally_forms — make creator_id nullable (unassigned forms allowed)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tally_forms
  ALTER COLUMN creator_id DROP NOT NULL;

-- Index for listing unassigned forms
CREATE INDEX IF NOT EXISTS tally_forms_unassigned_idx
  ON public.tally_forms (creator_id)
  WHERE creator_id IS NULL;

-- Drop the old per-creator key table (no longer needed)
DROP TABLE IF EXISTS public.tally_api_keys CASCADE;
