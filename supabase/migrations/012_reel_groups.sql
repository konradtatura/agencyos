-- ============================================================================
-- AgencyOS — Sprint 8: Reel Script Grouping
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. reel_groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reel_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reel_groups_creator_id_idx ON public.reel_groups (creator_id);

ALTER TABLE public.reel_groups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reel_groups' AND policyname = 'creators_manage_reel_groups'
  ) THEN
    CREATE POLICY "creators_manage_reel_groups"
      ON public.reel_groups FOR ALL
      USING (
        creator_id IN (
          SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. instagram_posts — add reel_group_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.instagram_posts
  ADD COLUMN IF NOT EXISTS reel_group_id uuid
    REFERENCES public.reel_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS instagram_posts_reel_group_id_idx
  ON public.instagram_posts (reel_group_id)
  WHERE reel_group_id IS NOT NULL;
