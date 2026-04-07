-- ============================================================================
-- AgencyOS — Revenue / Whop integration additions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add Whop columns to creator_profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS whop_api_key_enc     TEXT,
  ADD COLUMN IF NOT EXISTS whop_last_synced_at  TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Add whop_product_id to products
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS whop_product_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS products_whop_product_id_idx
  ON public.products (creator_id, whop_product_id)
  WHERE whop_product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS policies for sales (missing from 009)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sales' AND policyname = 'creator_own_sales'
  ) THEN
    CREATE POLICY "creator_own_sales" ON public.sales
      FOR ALL
      USING (
        auth.uid() IN (
          SELECT user_id FROM public.creator_profiles WHERE id = creator_id
        )
      );
  END IF;
END $$;

-- Allow super_admin (service role via admin client) unrestricted access —
-- the admin client bypasses RLS entirely, so no extra policy needed.

-- ---------------------------------------------------------------------------
-- 4. RLS for products (ensure super_admin can manage via admin client)
-- ---------------------------------------------------------------------------
-- Products already have "creator_own_products" policy from 009.
-- Admin client bypasses RLS so no additional policy is needed.
