-- Separate table for opt-ins (form submissions) vs page views
-- This gives us opt-in rate per page without mixing with view counts

CREATE TABLE IF NOT EXISTS public.funnel_opt_ins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   uuid        REFERENCES public.creator_profiles(id) ON DELETE SET NULL,
  location_id  text        NOT NULL,
  contact_id   text        NOT NULL,
  page_path    text        NOT NULL,
  page_name    text        NOT NULL DEFAULT '',
  funnel_name  text,
  opted_in_at  timestamptz NOT NULL DEFAULT now()
);

-- One opt-in per contact per page (deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS funnel_opt_ins_contact_path_idx
  ON public.funnel_opt_ins (contact_id, page_path);

CREATE INDEX IF NOT EXISTS funnel_opt_ins_creator_idx
  ON public.funnel_opt_ins (creator_id, opted_in_at);

ALTER TABLE public.funnel_opt_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_read_opt_ins"
  ON public.funnel_opt_ins FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
    )
  );

-- Allow service role inserts (webhook writes via admin client)
CREATE POLICY "service_role_insert_opt_ins"
  ON public.funnel_opt_ins FOR INSERT
  WITH CHECK (true);
