# AgencyOS — Build Context

Private ops platform for a creator-scaling agency. Agency manages multiple creator clients.
Stack: Next.js 15 App Router · TypeScript · Tailwind · Supabase (DB + Auth) · Railway deploy.

---

## 1. BUILD STATUS

| Feature | Status | Notes |
|---|---|---|
| Auth + roles (super_admin / creator / setter / closer) | ✅ Complete | Impersonation via cookie + middleware header |
| Creator onboarding wizard | 🔧 Broken | Gate disabled in middleware (`TODO: re-enable once stable`) |
| CRM — kanban board (main + downgrade pipelines) | ✅ Complete | Dynamic stages post-migration 022 |
| CRM — lead detail (notes, history, assignment, deal value) | ✅ Complete | |
| CRM — lead creation from Tally / GHL webhook | ✅ Complete | |
| CRM — stage management (custom per-creator pipeline_stages) | ✅ Complete | |
| CRM — disqualify → downgrade pipeline | ✅ Complete | Routes lead to mt/lt pipeline |
| CRM — call outcome recording (showed/no_show/closed_won/lost) | ✅ Complete | Creates sale on won, pushes to GHL |
| GHL stage sync (pushStageToGHL) | ✅ Complete | Maps AgencyOS stages to GHL tags |
| GHL appointment sync (sync-appointments route) | ✅ Complete | Hardcoded stage UUIDs + closer mapping |
| GHL webhook → auto-create lead on booking | ✅ Complete | Public endpoint, resolves creator by location_id |
| Instagram OAuth + token refresh | ✅ Complete | Graph v22, encrypted token storage |
| Instagram analytics (follower growth, reach, engagement) | ✅ Complete | |
| Instagram reel/post sync + manual metrics override | ✅ Complete | |
| Instagram stories sync | ✅ Complete | |
| Instagram reel auto-grouping (Jaccard similarity, 0.80 threshold) | ✅ Complete | |
| Whisper transcription (100/day limit) | ✅ Complete | OpenAI whisper-1 |
| Claude content analysis (top topics, hooks, recs) | ✅ Complete | claude-opus-4-6, last 20 transcribed videos |
| Tally integration (agency key, form list, submissions) | ✅ Complete | Encrypted key in agency_settings |
| Tally → CRM lead creation | ✅ Complete | Match by ig_handle or phone |
| Tally drop-off funnel insights | ✅ Complete | |
| Content pipeline kanban (6-stage) | ✅ Complete | |
| Stories planner (sequences with story link) | ✅ Complete | |
| DM inbox (setter view, conversation list, reply) | ✅ Complete | Migration 027 |
| DM webhook (Instagram → dm_conversations + dm_messages) | ✅ Complete | Public endpoint |
| Revenue — products + sales CRUD | ✅ Complete | |
| Revenue — Whop sync (MRR, cash collected) | ✅ Complete | Encrypted key |
| Revenue — summary (by tier / platform / closer / monthly) | ✅ Complete | |
| Metrics — pageview tracking (embed script) | ✅ Complete | CORS-open POST, geo via ipapi.co |
| Metrics — VSL funnel (visitors → booked) | ✅ Complete | |
| Metrics — conversion funnel (per-page, device, referrer, country) | ✅ Complete | |
| Metrics — funnel branch view (LT / MT / HT 3-column) | ✅ Complete | Driven by funnel_config jsonb; migration 031 |
| Funnel config editor in Settings | ✅ Complete | PATCH /api/creator/funnel-config |
| EOD submission forms (setter + closer) | ✅ Complete | Migrations 026/029/030 |
| Admin panel (creator management, team, Tally assign, overview KPIs) | ✅ Complete | |
| Setter portal (DMs, assigned CRM, stats, forms) | ✅ Complete | |
| Closer portal (calls, CRM, stats, forms) | ✅ Complete | |
| Calendar view (booked calls) | ✅ Complete | |
| YouTube analytics | ⏭️ Skipped | Page shell exists, no data |
| Stripe integration | ⏭️ Skipped | Platform enum includes it, no routes |
| Unified encryption lib | ⏭️ Skipped | Two libs exist (crypto.ts vs encryption.ts) |

---

## 2. KEY IDs

| What | Value | Where |
|---|---|---|
| Mike's creator_id | `12dc3d67-e753-4e7b-8812-206fca608e0b` | Hardcoded in migration 031 (funnel_config seed) |
| GHL closer mapping | `vAQWK7yqxxHHCKgEfk1m` → `037464a8-a9a8-4402-b193-174de07a73f7` | `app/api/ghl/sync-appointments/route.ts` — GHL user ID → AgencyOS user UUID |
| GHL stage UUIDs (12 total) | see sync-appointments route | Hardcoded STAGE_ID_TO_NAME map (Disqualified, MT Budget, Qualified, LT, MT PiF, MT Split, Booked MT Call, Booked, No-show, No-close, HT PiF, HT Split) |
| Railway deploy URL | `https://agencyos-production-e20e.up.railway.app` | `lib/tracking/script.ts` — embedded in tracking script |
| Transcription daily limit | `100` | `lib/instagram/transcription-limits.ts` |
| Reel similarity threshold | `0.80` | `lib/transcript-similarity.ts` |

---

## 3. KEY DECISIONS

**Auth pattern**
- Four roles: `super_admin` | `creator` | `setter` | `closer`. Stored in `public.users.role`.
- `resolveCrmUser()` (`app/api/crm/_auth.ts`) is the standard auth helper for API routes. Returns `{ admin, userId, role, creatorId }`. Impersonating super_admin is converted to `role:'creator'` transparently.
- `getCreatorId()` (`lib/get-creator-id.ts`) reads impersonation header first, then looks up `creator_profiles.user_id`. Used in simpler settings-type routes.
- Creator resolution for metrics/settings routes: super_admin without impersonation → first creator profile by created_at. Setter/closer → `team_members.creator_id`.

**API pattern**
- All dashboard API routes under `app/api/`. Public webhook routes have no auth (`/api/webhooks/*`, `/api/track/*`).
- Supabase admin client (service role, RLS bypassed) used everywhere in API routes. Client-side uses anon key with RLS.
- Routes return `NextResponse.json()`. Errors: `{ error: string }` with appropriate HTTP status.
- Creator-scoped data always filtered by `creator_id`. Setter/closer see only their assigned items.

**DB patterns**
- All tables have `creator_id uuid` except agency-level tables (`agency_config`, `agency_settings`, `users`, `team_members`).
- `leads.stage` is a free string (post-migration 022) validated against `pipeline_stages` rows. Prior hardcoded CHECK constraint removed.
- Two pipelines per creator: `main` and `downgrade`. Disqualified leads move to downgrade with `offer_tier` set.
- JSONB used for: `leads.tally_answers`, `creator_profiles.funnel_config`, `tally_forms.questions`, `integrations.meta`, `pipeline_stages.color`.

**Encryption**
- IG tokens + Whop key: AES-256-GCM, 12-byte IV, key=`ENCRYPTION_KEY` env (`lib/crypto.ts`).
- Tally agency key: AES-256-GCM, 16-byte IV, key=`TALLY_ENCRYPTION_KEY` env (`lib/tally/encryption.ts`).
- GHL keys (agency + per-creator): **PLAINTEXT** in DB. Known inconsistency, not fixed.
- `lib/encryption.ts` exists with 16-byte IV but is not clearly used — likely dead code.

**Funnel config pattern**
- `creator_profiles.funnel_config` jsonb: `{ funnels: [{ id, name, entry_path, branches: [{ id, label, color, steps: [{ label, path }] }] }] }`
- Funnel branch metrics: unique session counts per `page_path`, filter `funnel_name = config.funnel.name OR funnel_name IS NULL`.
- Edited in Settings UI (`funnel-setup.tsx`), persisted via PATCH `/api/creator/funnel-config`.

**Tracking embed**
- JS snippet generated in `lib/tracking/script.ts` with hardcoded Railway URL. Sends POST to `/api/track/pageview` (CORS *). Creator identified by `ghl_location_id` query param.

**External services**
- Instagram Graph API v22.0 — OAuth, account metrics, media, stories
- Go High Level (LeadConnector) — webhook booking intake, stage sync, appointment fetch
- Tally — form submissions webhook + API (agency key encrypted)
- Whop — MRR sync via REST API (per-creator key encrypted)
- OpenAI whisper-1 — audio transcription
- Anthropic claude-opus-4-6 — content analysis (Claude SDK structured output + Zod)
- ipapi.co — geo lookup on pageview tracking

---

## 4. WHAT'S BROKEN

| Bug | Details |
|---|---|
| Onboarding wizard | Gate disabled in `lib/supabase/middleware.ts` with a TODO. New creators land on dashboard with no setup flow. |
| Two encryption libs | `lib/crypto.ts` (12-byte IV) and `lib/encryption.ts` (16-byte IV) both exist, both keyed on `ENCRYPTION_KEY`. IG uses `crypto.ts`. Unclear if `encryption.ts` is referenced at all. Risk of decrypt failures if libs are ever swapped. |
| GHL keys stored plaintext | `agency_config.ghl_api_key` and `creator_profiles.ghl_api_key` not encrypted. All other secrets are. |
| `funnel_names` endpoint now unused | `GET /api/metrics/funnel/names` still exists but MetricsDashboard no longer calls it (funnel list now comes from `funnel_config`). Dead route. |
| `funnel_names` in EMPTY constant | `app/api/metrics/funnel/route.ts` line 95: `funnel_names: []` is in the EMPTY object but `funnel_names` is not in the `FunnelMetricsResponse` type — TypeScript allows it only due to `as any` cast on line 353. Benign but inconsistent. |
| Branch metrics showed "No data yet" | ~~Fixed~~. `funnel-branches/route.ts` was filtering `funnel_name` in JS after fetching all rows; rows with `funnel_name = NULL` (all pre-config tracking data) were correctly matched but the original JS filter had a subtle loose-equality bug. Fixed by pushing `.or(funnel_name.eq.X,funnel_name.is.null)` to the DB query. |

---

## 5. WHAT'S NEXT

Logical next builds based on current state:

1. ~~**Funnel branch data hookup**~~ — Migration 031 run, NULL funnel_name bug fixed. Branch metrics should now show real data for existing pageviews.
2. **EOD reporting dashboards** — The submission schema (026/029/030) and form exist. No aggregated view for the agency owner or per-closer/setter performance.
3. **Onboarding wizard** — Re-enable the middleware gate once the flow is stable. Currently no guided setup for new creators.
4. **DM reply verification** — The reply route exists (`POST /api/dms/[conversationId]/reply`) but whether Graph API delivery actually works in production is unverified.
5. **Encryption cleanup** — Remove `lib/encryption.ts` if dead, or consolidate to one lib. Encrypt GHL keys.
6. **YouTube analytics** — Page shell exists at `/dashboard/youtube`. Needs a YouTube Data API integration.
7. **Stripe integration** — `platform` enum in `sales` table includes `stripe` but no connect/sync routes exist.

---

## 6. FILE MAP

### API Routes
| File | Purpose |
|---|---|
| `app/api/crm/_auth.ts` | `resolveCrmUser()` + `resolveCrmLead()` — standard auth for all CRM/metrics routes |
| `app/api/crm/leads/route.ts` | List (filters: stage, pipeline_type, offer_tier, setter, closer, search, dm_conversation_id) + create |
| `app/api/crm/leads/[id]/stage/route.ts` | Stage transition, writes stage_history |
| `app/api/crm/leads/[id]/outcome/route.ts` | Record call outcome: no_show / showed_lost / showed_won (creates sale + pushes GHL) |
| `app/api/crm/leads/[id]/disqualify/route.ts` | Move to downgrade pipeline with downgrade_offer tier |
| `app/api/crm/stages/route.ts` | CRUD for custom pipeline_stages per creator |
| `app/api/ghl/sync-appointments/route.ts` | Pulls GHL opportunities + appointments → upsert leads/booked_at. Hardcoded stage UUIDs + closer mapping. |
| `app/api/webhooks/ghl/route.ts` | Public. GHL booking → create/update lead stage=call_booked |
| `app/api/webhooks/tally/route.ts` | Public. Tally submission → upsert tally_submissions, optionally create/enrich lead |
| `app/api/webhooks/instagram-dm/route.ts` | Public. Instagram DM webhook → upsert dm_conversations + dm_messages |
| `app/api/track/pageview/route.ts` | Public, CORS *. Upsert funnel_pageviews. Geo via ipapi.co. Creator via ghl_location_id. |
| `app/api/metrics/funnel/route.ts` | Pageview funnel: per-step unique sessions, device/referrer, country, daily_views |
| `app/api/metrics/funnel-branches/route.ts` | Branch funnel: reads funnel_config, counts unique sessions per step path |
| `app/api/metrics/vsl/route.ts` | VSL CRM metrics: period stats, per-closer trend, revenue |
| `app/api/creator/funnel-config/route.ts` | GET/PATCH funnel_config jsonb on creator_profiles. Uses resolveCrmUser for role handling. |
| `app/api/revenue/whop/sync/route.ts` | Pulls Whop memberships → upsert sales, update MRR fields |
| `app/api/admin/creators/route.ts` | Invite creator (creates auth user + creator_profiles row), hardcoded VALID_NICHES |
| `app/api/admin/creators/[id]/impersonate/route.ts` | Sets `impersonating_creator_id` httpOnly cookie (8h) |
| `app/api/admin/overview/route.ts` | Agency-wide KPIs. DEAD_STAGES constant. |
| `app/api/instagram/sync/route.ts` | Kicks off full IG account sync |
| `app/api/instagram/transcribe/route.ts` | Whisper transcription with daily limit check |
| `app/api/instagram/analyze/route.ts` | Claude content analysis of last 20 transcribed reels |

### Pages
| File | Purpose |
|---|---|
| `app/dashboard/metrics/MetricsDashboard.tsx` | Full metrics dashboard: KPI cards, CRM funnel bars, 3-column branch funnel, daily charts, traffic/device/country |
| `app/dashboard/metrics/TrackingScriptPanel.tsx` | Copy-paste embed snippet for creator's funnel pages |
| `app/dashboard/crm/CrmBoard.tsx` | Kanban drag-drop CRM (main + downgrade pipelines) |
| `app/dashboard/crm/[id]/page.tsx` | Lead detail page |
| `app/dashboard/settings/page.tsx` | Settings: Instagram, Whop, DM webhook, GHL location/key, Funnel Setup |
| `app/dashboard/settings/funnel-setup.tsx` | Client component: edit funnel config (funnels + branches + steps), PATCH to API |
| `app/dashboard/revenue/page.tsx` | Revenue dashboard (products, sales, Whop sync) |
| `app/dashboard/dms/page.tsx` | DM inbox for setter |
| `app/admin/creators/page.tsx` | Creator management (invite, impersonate, assign location) |
| `app/admin/overview/page.tsx` | Agency KPIs dashboard |

### Library
| File | Purpose |
|---|---|
| `lib/get-creator-id.ts` | Reads impersonation header → falls back to creator_profiles.user_id lookup |
| `lib/get-session-user.ts` | Returns full user row with authoritative role from users table |
| `lib/auth.ts` | Role constants, ROLE_HOME mapping (role → default redirect path) |
| `lib/supabase/middleware.ts` | Route gating, redirect logic, injects x-impersonating-creator-id header. Onboarding gate DISABLED. |
| `lib/ghl-sync.ts` | `pushStageToGHL(leadId, stage)` — maps CRM stage → GHL contact tag |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt, 12-byte IV, used for IG tokens + Whop key |
| `lib/tally/encryption.ts` | AES-256-GCM, 16-byte IV, TALLY_ENCRYPTION_KEY, used for Tally agency key |
| `lib/instagram/sync.ts` | Full account metrics sync orchestrator |
| `lib/instagram/sync-posts.ts` | Reel/post media sync |
| `lib/analysis/content-analyzer.ts` | Claude Opus structured analysis (Zod schema) of last 20 transcribed videos |
| `lib/transcription/whisper.ts` | OpenAI Whisper → post_transcripts → auto-group reels |
| `lib/tracking/script.ts` | Generates embed JS with hardcoded Railway URL |

---

## 7. DB TABLES

| Table | Purpose |
|---|---|
| `users` | Auth users with role column (super_admin/creator/setter/closer) |
| `creator_profiles` | One row per creator client. Holds all integration keys, ghl_location_id, funnel_config jsonb, whop_company_id |
| `team_members` | Setter/closer → creator assignments (many setters/closers per creator) |
| `integrations` | OAuth tokens per platform per creator (instagram; access_token encrypted) |
| `agency_config` | Single-row table. Holds agency-level GHL API key (plaintext) |
| `agency_settings` | Key-value store for agency config. Tally API key (encrypted) stored here |
| `leads` | Core CRM entity. stage is free string (validated by pipeline_stages). pipeline_type main/downgrade. tally_answers jsonb. |
| `lead_stage_history` | Immutable log of every stage transition on a lead |
| `lead_notes` | Free-text notes on leads with author |
| `pipeline_stages` | Custom stage definitions per creator per pipeline_type (main/downgrade). has is_won, is_lost flags. |
| `products` | Offer tiers (ht/mt/lt) per creator with pricing and whop_product_id link |
| `sales` | Revenue events linked to lead + product. platform: stripe/whop/manual. payment_type: upfront/instalment/recurring. |
| `funnel_pageviews` | Tracking events per session. page_path, device_type, referrer_source, country, funnel_name. Creator identified by ghl_location_id lookup. |
| `page_leave_events` | Time-on-page per session per path. Joined to funnel_pageviews for avg dwell time. |
| `instagram_accounts` | One per connected creator. Stores follower count, ig_user_id. |
| `instagram_account_snapshots` | Daily follower/reach/engagement snapshots |
| `instagram_posts` | Post metadata + metrics (views, likes, comments, saves, reach). reel_group_id FK. transcript_status. |
| `instagram_post_metrics` | Historical per-day metrics per post |
| `instagram_stories` | Story metadata + engagement |
| `post_transcripts` | Whisper output per post. One row per post. |
| `content_analyses` | Claude output per creator. JSON: top_topics, hook_analysis, content_pillars, recommendations, overall_score. |
| `reel_groups` | Named groups of reels (auto-grouped by transcript similarity or manually) |
| `tally_forms` | Form metadata synced from Tally API. questions jsonb. Assigned to creator. |
| `tally_submissions` | Raw submission data from Tally webhook. Links to tally_forms. Can be converted to lead. |
| `content_ideas` | Content pipeline items. 6-stage workflow. platform instagram/youtube/both. |
| `story_sequences` | Planned story arcs. Links to instagram_posts and leads. |
| `eod_submissions` | End-of-day reports from setters and closers. ~25 stat columns (calls, convos, closes, no-shows, reasons, confidence, etc.) |
| `dm_conversations` | Instagram DM threads per creator. Tracks assigned_setter_id, unread_count, linked lead. |
| `dm_messages` | Individual DM messages. ig_message_id unique constraint deduplicates webhook replays. |
| `ad_spend` | Manual ad spend entries per creator per date |
