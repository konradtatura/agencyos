-- ============================================================================
-- AgencyOS — Sprint 7: Content Pipeline
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. content_ideas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_ideas (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        uuid         NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  title             text         NOT NULL,
  script            text,
  platform          text         NOT NULL DEFAULT 'instagram'
                                 CHECK (platform IN ('instagram', 'youtube', 'both')),
  stage             text         NOT NULL DEFAULT 'idea'
                                 CHECK (stage IN (
                                   'idea', 'preparing', 'recorded',
                                   'editing', 'ready_to_post', 'uploaded'
                                 )),
  inspiration_url   text,
  additional_info   text,
  stage_entered_at  timestamptz  NOT NULL DEFAULT now(),
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS content_ideas_creator_id_idx ON public.content_ideas (creator_id);
CREATE INDEX IF NOT EXISTS content_ideas_stage_idx       ON public.content_ideas (stage);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_ideas_set_updated_at ON public.content_ideas;
CREATE TRIGGER content_ideas_set_updated_at
  BEFORE UPDATE ON public.content_ideas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

-- Creators can only see their own ideas
CREATE POLICY "creator_select_own_ideas" ON public.content_ideas
  FOR SELECT USING (
    creator_id = (
      SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "creator_insert_own_ideas" ON public.content_ideas
  FOR INSERT WITH CHECK (
    creator_id = (
      SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "creator_update_own_ideas" ON public.content_ideas
  FOR UPDATE USING (
    creator_id = (
      SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "creator_delete_own_ideas" ON public.content_ideas
  FOR DELETE USING (
    creator_id = (
      SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
    )
  );
