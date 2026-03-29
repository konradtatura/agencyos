-- ============================================================================
-- AgencyOS — Sprint 12 (partial): products + sales tables
--            Also adds 'no_show' to the leads stage enum
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     uuid          NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  name           text          NOT NULL,
  tier           text          NOT NULL CHECK (tier IN ('ht','mt','lt')),
  payment_type   text          NOT NULL CHECK (payment_type IN ('onetime','recurring','plan')),
  price          numeric(10,2) NOT NULL DEFAULT 0,
  active         boolean       NOT NULL DEFAULT true,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_creator_idx ON public.products (creator_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_own_products" ON public.products
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM public.creator_profiles WHERE id = creator_id
    )
  );

-- ---------------------------------------------------------------------------
-- 2. sales
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       uuid          NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  lead_id          uuid          REFERENCES public.leads(id) ON DELETE SET NULL,
  product_id       uuid          REFERENCES public.products(id) ON DELETE SET NULL,
  product_name     text,         -- snapshot in case product is deleted
  amount           numeric(10,2) NOT NULL DEFAULT 0,
  platform         text          NOT NULL DEFAULT 'manual'
                                 CHECK (platform IN ('stripe','whop','manual')),
  payment_type     text          NOT NULL
                                 CHECK (payment_type IN ('upfront','instalment','recurring')),
  sale_date        date          NOT NULL DEFAULT CURRENT_DATE,
  closer_id        uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  lead_source_type text          CHECK (lead_source_type IN ('story','reel','organic','manual','vsl_funnel')),
  lead_source_id   uuid,
  stripe_charge_id text,
  whop_sale_id     text,
  lost_reason      text,         -- for closed_lost tracking
  notes            text,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_creator_idx   ON public.sales (creator_id);
CREATE INDEX IF NOT EXISTS sales_lead_idx      ON public.sales (lead_id);
CREATE INDEX IF NOT EXISTS sales_closer_idx    ON public.sales (closer_id);
CREATE INDEX IF NOT EXISTS sales_sale_date_idx ON public.sales (sale_date);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Extend leads.stage to include 'no_show'
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_stage_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_stage_check
  CHECK (stage IN (
    'dmd','qualifying','qualified','call_booked','showed',
    'closed_won','closed_lost','follow_up','nurture',
    'disqualified','dead','no_show'
  ));
