-- ============================================================================
-- AgencyOS — Database Schema
-- Sprint 0: Foundation tables, RLS, auth trigger
-- ============================================================================
-- Run this once against a fresh Supabase project.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Returns the current user's role from JWT claims.
-- Reads app_metadata first (set by service-role key — tamper-proof),
-- then falls back to user_metadata.
-- Using JWT avoids a DB round-trip on every RLS evaluation.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role'
  );
$$;

-- Shorthand used throughout RLS policies.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() = 'super_admin';
$$;

-- Automatically bumps updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Tables
-- (Created in dependency order: no FKs reference tables defined below)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. agency_config — single-row global platform settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_config (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name  text        NOT NULL    DEFAULT 'AgencyOS',
  logo_url       text,
  brand_color    text                    DEFAULT '#2563eb',
  support_email  text,
  created_at     timestamptz NOT NULL    DEFAULT now(),
  updated_at     timestamptz NOT NULL    DEFAULT now()
);

CREATE OR REPLACE TRIGGER agency_config_updated_at
  BEFORE UPDATE ON public.agency_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. users — public profile, mirrors auth.users
-- Populated automatically by the handle_new_auth_user trigger below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL UNIQUE,
  role        text        NOT NULL CHECK (role IN ('super_admin', 'creator', 'setter', 'closer')),
  full_name   text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);
CREATE INDEX IF NOT EXISTS users_role_idx  ON public.users (role);

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. creator_profiles — one row per creator client
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  niche                text,
  logo_url             text,
  brand_color          text,
  subdomain            text        UNIQUE,
  onboarding_complete  boolean     NOT NULL DEFAULT false,
  onboarding_step      integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_profiles_user_id_idx   ON public.creator_profiles (user_id);
CREATE INDEX IF NOT EXISTS creator_profiles_subdomain_idx ON public.creator_profiles (subdomain);

CREATE OR REPLACE TRIGGER creator_profiles_updated_at
  BEFORE UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. team_members — setters and closers linked to a creator workspace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('setter', 'closer')),
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_members_creator_user_unique UNIQUE (creator_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_creator_id_idx ON public.team_members (creator_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx    ON public.team_members (user_id);

CREATE OR REPLACE TRIGGER team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. integrations — OAuth tokens / API keys per creator per platform
-- NOTE: access_token and refresh_token must be encrypted at the application
--       layer before writing. Do not store plaintext credentials.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  platform       text        NOT NULL CHECK (platform IN ('instagram', 'youtube', 'stripe', 'whop', 'ghl')),
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  meta           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT integrations_creator_platform_unique UNIQUE (creator_id, platform)
);

CREATE INDEX IF NOT EXISTS integrations_creator_id_idx ON public.integrations (creator_id);
CREATE INDEX IF NOT EXISTS integrations_platform_idx   ON public.integrations (platform);
CREATE INDEX IF NOT EXISTS integrations_status_idx     ON public.integrations (status);

CREATE OR REPLACE TRIGGER integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Default Data
-- ============================================================================

INSERT INTO public.agency_config (platform_name)
VALUES ('AgencyOS')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.agency_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- agency_config
-- ---------------------------------------------------------------------------

-- All authenticated users can read global config (needed to render branding).
CREATE POLICY "agency_config: authenticated read"
  ON public.agency_config FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admin can insert, update, or delete.
CREATE POLICY "agency_config: super_admin write"
  ON public.agency_config FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- A user can read their own row.
CREATE POLICY "users: read own"
  ON public.users FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Super admin can read every user.
CREATE POLICY "users: super_admin read all"
  ON public.users FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- A user can update their own profile fields (full_name, avatar_url).
-- Role changes require the service-role key — not grantable client-side.
CREATE POLICY "users: update own"
  ON public.users FOR UPDATE
  TO authenticated
  USING     ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Super admin can update any user (e.g. deactivate, rename).
CREATE POLICY "users: super_admin update all"
  ON public.users FOR UPDATE
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- INSERT is handled exclusively by the auth trigger via service role.
-- No client-facing INSERT policy is granted.

-- ---------------------------------------------------------------------------
-- creator_profiles
-- ---------------------------------------------------------------------------

-- Creator reads and updates their own profile.
CREATE POLICY "creator_profiles: read own"
  ON public.creator_profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "creator_profiles: update own"
  ON public.creator_profiles FOR UPDATE
  TO authenticated
  USING     ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Team members (setter / closer) can read the creator profile they work under.
CREATE POLICY "creator_profiles: team member read"
  ON public.creator_profiles FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT creator_id
      FROM   public.team_members
      WHERE  user_id = (SELECT auth.uid())
        AND  active  = true
    )
  );

-- Super admin has unrestricted access.
CREATE POLICY "creator_profiles: super_admin all"
  ON public.creator_profiles FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------

-- A team member can read their own membership record.
CREATE POLICY "team_members: read own"
  ON public.team_members FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Creator can read all team members assigned to their workspace.
CREATE POLICY "team_members: creator read own team"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

-- Creator can fully manage (add, update, remove) their team.
CREATE POLICY "team_members: creator manage own team"
  ON public.team_members FOR ALL
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

-- Super admin has unrestricted access.
CREATE POLICY "team_members: super_admin all"
  ON public.team_members FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- integrations
-- ---------------------------------------------------------------------------

-- Creator can read and manage integrations for their own workspace.
CREATE POLICY "integrations: creator manage own"
  ON public.integrations FOR ALL
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

-- Super admin has unrestricted access.
CREATE POLICY "integrations: super_admin all"
  ON public.integrations FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============================================================================
-- Auth Trigger — auto-create public.users row on signup
-- ============================================================================
-- Fires after every INSERT on auth.users.
-- Reads role from raw_app_meta_data (set via service key, tamper-proof),
-- falls back to raw_user_meta_data, then defaults to 'creator'.
-- SECURITY DEFINER + fixed search_path prevent privilege escalation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_app_meta_data  ->> 'role',
      NEW.raw_user_meta_data ->> 'role',
      'creator'
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Drop first so this script is safely re-runnable.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- Sprint 2 — Instagram Analytics Tables
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 6. instagram_accounts — latest account snapshot per creator
-- One row per creator. Updated on every sync.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          uuid        NOT NULL UNIQUE REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  ig_user_id          text        NOT NULL,
  username            text,
  name                text,
  profile_picture_url text,
  followers_count     integer,
  media_count         integer,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_accounts_creator_id_idx ON public.instagram_accounts (creator_id);
CREATE INDEX IF NOT EXISTS instagram_accounts_ig_user_id_idx ON public.instagram_accounts (ig_user_id);

CREATE OR REPLACE TRIGGER instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. instagram_account_snapshots — one row per creator per calendar day
-- follower_count from insights is the net daily delta (not absolute).
-- Absolute count is in instagram_accounts.followers_count.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_account_snapshots (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  date             date        NOT NULL,
  -- Daily time-series values (from period=day&metric_type=time_series)
  followers_count  integer,   -- net delta for this day
  reach            integer,   -- daily reach
  -- Period totals — populated only on the snapshot for the day the sync ran.
  -- These match Instagram's native 7-day / 30-day numbers exactly.
  reach_7d              integer,
  reach_30d             integer,
  profile_views_7d      integer,
  profile_views_30d     integer,
  accounts_engaged_7d   integer,
  accounts_engaged_30d  integer,
  website_clicks_7d     integer,
  website_clicks_30d    integer,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instagram_account_snapshots_creator_date_unique UNIQUE (creator_id, date)
);

-- Migration for existing deployments (safe to run on a live database):
-- ALTER TABLE public.instagram_account_snapshots
--   ADD COLUMN IF NOT EXISTS reach_7d             integer,
--   ADD COLUMN IF NOT EXISTS reach_30d            integer,
--   ADD COLUMN IF NOT EXISTS profile_views_7d     integer,
--   ADD COLUMN IF NOT EXISTS profile_views_30d    integer,
--   ADD COLUMN IF NOT EXISTS accounts_engaged_7d  integer,
--   ADD COLUMN IF NOT EXISTS accounts_engaged_30d integer,
--   ADD COLUMN IF NOT EXISTS website_clicks_7d    integer,
--   ADD COLUMN IF NOT EXISTS website_clicks_30d   integer;

CREATE INDEX IF NOT EXISTS instagram_account_snapshots_creator_id_idx   ON public.instagram_account_snapshots (creator_id);
CREATE INDEX IF NOT EXISTS instagram_account_snapshots_creator_date_idx ON public.instagram_account_snapshots (creator_id, date DESC);

-- ============================================================================
-- RLS — Instagram Analytics
-- ============================================================================

ALTER TABLE public.instagram_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_account_snapshots ENABLE ROW LEVEL SECURITY;

-- Creator reads their own instagram_accounts row.
CREATE POLICY "instagram_accounts: creator read own"
  ON public.instagram_accounts FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

-- Super admin reads all.
CREATE POLICY "instagram_accounts: super_admin read all"
  ON public.instagram_accounts FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Creator reads their own snapshots.
CREATE POLICY "instagram_account_snapshots: creator read own"
  ON public.instagram_account_snapshots FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

-- Super admin reads all.
CREATE POLICY "instagram_account_snapshots: super_admin read all"
  ON public.instagram_account_snapshots FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============================================================================
-- Sprint 3 — Content Pipeline Tables
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 8. instagram_posts — one row per IG media item per creator
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_posts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        uuid        NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  ig_media_id       text        NOT NULL UNIQUE,
  caption           text,
  media_type        text        NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  media_url         text,
  thumbnail_url     text,
  permalink         text,
  posted_at         timestamptz NOT NULL,
  -- transcript_status tracks Whisper transcription state for video posts
  transcript_status text        NOT NULL DEFAULT 'none'
                                CHECK (transcript_status IN ('none', 'processing', 'done')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_posts_creator_id_idx   ON public.instagram_posts (creator_id);
CREATE INDEX IF NOT EXISTS instagram_posts_ig_media_id_idx  ON public.instagram_posts (ig_media_id);
CREATE INDEX IF NOT EXISTS instagram_posts_posted_at_idx    ON public.instagram_posts (creator_id, posted_at DESC);

-- ---------------------------------------------------------------------------
-- 9. instagram_post_metrics — one snapshot per post per day
-- Stores both engagement data from the media object (like_count, comments_count)
-- and per-post insights from the Graph API (reach, saved, shares, views).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_post_metrics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id             uuid        NOT NULL REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  synced_at           timestamptz NOT NULL DEFAULT now(),
  -- Set explicitly by the sync service (today's UTC date). Drives the unique constraint.
  synced_date         date        NOT NULL,
  reach               integer,
  saved               integer,
  shares              integer,
  views               integer,
  like_count          integer,
  comments_count      integer,
  total_interactions  integer,
  profile_visits      integer,   -- accounts that visited the profile after seeing this post

  CONSTRAINT instagram_post_metrics_post_synced_unique UNIQUE (post_id, synced_date)
);

CREATE INDEX IF NOT EXISTS instagram_post_metrics_post_id_idx  ON public.instagram_post_metrics (post_id);
CREATE INDEX IF NOT EXISTS instagram_post_metrics_synced_idx   ON public.instagram_post_metrics (post_id, synced_at DESC);

-- Migration for existing deployments:
-- Run the CREATE TABLE statements above. For the profile_visits column on existing tables:
-- ALTER TABLE public.instagram_post_metrics ADD COLUMN IF NOT EXISTS profile_visits integer;

-- ============================================================================
-- RLS — Content Pipeline
-- ============================================================================

ALTER TABLE public.instagram_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_post_metrics  ENABLE ROW LEVEL SECURITY;

-- Creator reads their own posts.
CREATE POLICY "instagram_posts: creator read own"
  ON public.instagram_posts FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

-- Super admin has unrestricted access.
CREATE POLICY "instagram_posts: super_admin all"
  ON public.instagram_posts FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Creator reads metrics for their own posts.
CREATE POLICY "instagram_post_metrics: creator read own"
  ON public.instagram_post_metrics FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT p.id FROM public.instagram_posts p
      JOIN   public.creator_profiles cp ON cp.id = p.creator_id
      WHERE  cp.user_id = (SELECT auth.uid())
    )
  );

-- Super admin has unrestricted access.
CREATE POLICY "instagram_post_metrics: super_admin all"
  ON public.instagram_post_metrics FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
