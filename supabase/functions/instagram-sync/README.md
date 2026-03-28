# instagram-sync — Supabase Edge Function

Cron-triggered function that syncs Instagram data for every creator
with an active integration. Runs every 6 hours.

## How it works

```
Supabase cron (every 6h)
  → Edge Function (instagram-sync)
    → POST /api/internal/instagram/sync-all   (Next.js, protected by CRON_SECRET)
      → triggerFullSync(creatorId)  ×  N creators
        → Instagram Graph API
        → upsert instagram_accounts + instagram_account_snapshots
```

## Prerequisites

1. Your Next.js app must be deployed and publicly reachable.
2. You need the `supabase` CLI installed (`npm i -g supabase`).

## Environment variables

Set these in **Supabase Dashboard → Edge Functions → Secrets** (or via CLI):

| Variable      | Description                                              |
|---------------|----------------------------------------------------------|
| `APP_URL`     | Deployed Next.js URL, e.g. `https://app.agencyos.com`   |
| `CRON_SECRET` | A long random secret — must match `CRON_SECRET` in your Next.js `.env` |

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set both in your Next.js deployment (Vercel → Environment Variables):
```
CRON_SECRET=<the secret you generated>
```

## Deploy the Edge Function

```bash
# Link to your Supabase project (first time only)
supabase link --project-ref <your-project-ref>

# Deploy the function
supabase functions deploy instagram-sync --no-verify-jwt
```

`--no-verify-jwt` is required because the function is triggered by a cron
schedule (no user JWT), not by a logged-in user.

## Set up the cron schedule

In **Supabase Dashboard → Database → Extensions**, enable `pg_cron` if not
already enabled.

Then run this SQL in the Supabase SQL editor:

```sql
-- Sync Instagram data every 6 hours
SELECT cron.schedule(
  'instagram-sync',               -- job name (unique)
  '0 */6 * * *',                  -- every 6 hours at :00
  $$
  SELECT net.http_post(
    url     := 'https://<your-project-ref>.supabase.co/functions/v1/instagram-sync',
    headers := '{"Authorization": "Bearer <your-anon-key>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

Replace:
- `<your-project-ref>` — found in Supabase Dashboard → Settings → General
- `<your-anon-key>` — found in Supabase Dashboard → Settings → API

## Verify the schedule

```sql
-- List all scheduled jobs
SELECT * FROM cron.job;

-- Check recent run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

## Manual trigger (testing)

```bash
# Via CLI
supabase functions invoke instagram-sync --no-verify-jwt

# Or via curl (replace values)
curl -X POST \
  https://<your-project-ref>.supabase.co/functions/v1/instagram-sync \
  -H "Authorization: Bearer <your-anon-key>"
```

## Remove the schedule

```sql
SELECT cron.unschedule('instagram-sync');
```
