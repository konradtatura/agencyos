-- ============================================================================
-- AgencyOS — Payment plans, post-call notes, expenses
-- ============================================================================

-- Add payment plan fields to existing sales table
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS total_contract_value   numeric,
  ADD COLUMN IF NOT EXISTS cash_collected_upfront numeric,
  ADD COLUMN IF NOT EXISTS amount_owed            numeric,
  ADD COLUMN IF NOT EXISTS instalment_count       int,
  ADD COLUMN IF NOT EXISTS expected_payoff_date   date,
  ADD COLUMN IF NOT EXISTS program_status         text
    CHECK (program_status IN ('active','finished','discontinued','refund_requested','refund_issued'))
    DEFAULT 'active';

-- Payment instalments
CREATE TABLE IF NOT EXISTS public.payment_instalments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           uuid        REFERENCES public.sales(id) ON DELETE CASCADE,
  creator_id        uuid        REFERENCES public.creator_profiles(id),
  instalment_number int         NOT NULL,
  amount            numeric     NOT NULL,
  due_date          date        NOT NULL,
  paid_date         date,
  status            text        CHECK (status IN ('pending','paid','overdue')) DEFAULT 'pending',
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_instalments_sale_idx    ON public.payment_instalments (sale_id);
CREATE INDEX IF NOT EXISTS payment_instalments_creator_idx ON public.payment_instalments (creator_id);
CREATE INDEX IF NOT EXISTS payment_instalments_due_idx     ON public.payment_instalments (due_date);

-- Post-call notes
CREATE TABLE IF NOT EXISTS public.post_call_notes (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id                uuid        REFERENCES public.creator_profiles(id),
  lead_id                   uuid        REFERENCES public.leads(id) ON DELETE SET NULL,
  sale_id                   uuid        REFERENCES public.sales(id) ON DELETE SET NULL,
  closer_id                 uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  setter_id                 uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  call_date                 date,
  appointment_source        text        CHECK (appointment_source IN ('story','reel','organic','ads','referral')),
  call_outcome              text        CHECK (call_outcome IN ('closed','no_show','follow_up','disqualified','rescheduled')),
  offer_pitched             text,
  initial_payment_platform  text,
  cash_collected_upfront    numeric,
  amount_owed               numeric,
  expected_payoff_date      date,
  instalment_count          int,
  prospect_notes            text,
  crm_updated               boolean,
  program_status            text        CHECK (program_status IN ('active','finished','discontinued','refund_requested','refund_issued')),
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_call_notes_creator_idx ON public.post_call_notes (creator_id);
CREATE INDEX IF NOT EXISTS post_call_notes_lead_idx    ON public.post_call_notes (lead_id);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid        REFERENCES public.creator_profiles(id),
  category    text        CHECK (category IN ('vendor','sales_team','ad_spend','other')),
  description text,
  amount      numeric     NOT NULL,
  date        date        NOT NULL,
  platform    text,       -- for ad_spend: Meta / Google / YouTube / Other
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_creator_idx ON public.expenses (creator_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx    ON public.expenses (date);

-- Enable RLS
ALTER TABLE public.payment_instalments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_call_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;

-- RLS policies (super_admin bypass + creator own)
CREATE POLICY "super_admin_payment_instalments" ON public.payment_instalments
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "creator_own_instalments" ON public.payment_instalments
  FOR ALL USING (
    creator_id = (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid() LIMIT 1)
    OR creator_id = (SELECT creator_id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "super_admin_post_call_notes" ON public.post_call_notes
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "creator_own_post_call_notes" ON public.post_call_notes
  FOR ALL USING (
    creator_id = (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid() LIMIT 1)
    OR creator_id = (SELECT creator_id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "super_admin_expenses" ON public.expenses
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "creator_own_expenses" ON public.expenses
  FOR ALL USING (
    creator_id = (SELECT id FROM public.creator_profiles WHERE user_id = auth.uid() LIMIT 1)
    OR creator_id = (SELECT creator_id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1)
  );
