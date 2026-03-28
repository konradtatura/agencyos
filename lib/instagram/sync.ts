/**
 * Instagram sync service — Sprint 2.
 * All functions run server-side only (API routes / cron jobs).
 * Uses the admin client for all DB writes; identity is established via
 * getInstagramToken which verifies the integration row exists.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getInstagramToken } from './token'
import { syncPosts } from './sync-posts'
import { syncStories } from './sync-stories'

const FB_API = 'https://graph.facebook.com/v22.0'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountFields {
  id:                  string
  username:            string
  name:                string
  followers_count:     number
  media_count:         number
  profile_picture_url: string | null
}

interface InsightValue {
  value:    number
  end_time: string // ISO-8601, end of the day period
}

/** time_series format — has a .values array with one entry per day */
interface TimeSeriesMetric {
  name:   string
  period: string
  values: InsightValue[]
}

/** total_value format — single aggregated value, no per-day breakdown */
interface TotalValueMetric {
  name:        string
  period:      string
  total_value: { value: number }
}

type InsightMetric = TimeSeriesMetric | TotalValueMetric

interface InsightsResponse {
  data:   InsightMetric[]
  error?: { message: string; code: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(fn: string, msg: string, data?: unknown) {
  console.log(`[ig-sync] [${fn}]`, msg, data !== undefined ? data : '')
}

function logError(fn: string, msg: string, data?: unknown) {
  console.error(`[ig-sync] [${fn}] ERROR:`, msg, data !== undefined ? data : '')
}

/**
 * Converts mixed insights responses into a map of
 * { "2024-01-15": { reach: 420, profile_views: 88, ... } }
 *
 * Handles two response shapes from the Graph API:
 *   time_series — has .values[], one entry per day. end_time is midnight at
 *                 the START of the following day, so subtract 1 day to get
 *                 the actual calendar date.
 *   total_value — has .total_value.value, a single number covering the whole
 *                 requested window. We spread this value across every date
 *                 already present in byDate (populated by time_series metrics
 *                 first) so each daily row gets the same figure.
 */
function pivotInsightsByDate(
  timeSeries: InsightMetric[],
  totalValue: InsightMetric[],
): Record<string, Record<string, number>> {
  const byDate: Record<string, Record<string, number>> = {}

  // Pass 1: time_series metrics build the date skeleton
  for (const metric of timeSeries) {
    const m = metric as TimeSeriesMetric
    for (const point of m.values ?? []) {
      const endDate = new Date(point.end_time)
      endDate.setUTCDate(endDate.getUTCDate() - 1)
      const dateKey = endDate.toISOString().split('T')[0]

      if (!byDate[dateKey]) byDate[dateKey] = {}
      byDate[dateKey][m.name] = typeof point.value === 'number' ? point.value : 0
    }
  }

  // Pass 2: total_value metrics — spread the single value across every known date
  const knownDates = Object.keys(byDate)
  for (const metric of totalValue) {
    const m     = metric as TotalValueMetric
    const value = typeof m.total_value?.value === 'number' ? m.total_value.value : 0
    for (const dateKey of knownDates) {
      byDate[dateKey][m.name] = value
    }
  }

  return byDate
}

// ── Core sync ─────────────────────────────────────────────────────────────────

/**
 * Fetches the latest account fields and 30-day insights for a creator,
 * then upserts into instagram_accounts and instagram_account_snapshots.
 */
export async function syncAccountStats(creatorId: string): Promise<void> {
  log('syncAccountStats', 'Starting sync', { creatorId })

  // ── Resolve token ────────────────────────────────────────────────────────
  const result = await getInstagramToken(creatorId)
  if (!result) {
    throw new Error(`No valid Instagram token for creator ${creatorId}`)
  }

  const { token, integration } = result
  const igUserId = integration.meta.ig_user_id

  if (!igUserId) {
    throw new Error(`No ig_user_id in integration meta for creator ${creatorId}`)
  }

  log('syncAccountStats', 'Token resolved', { igUserId })

  const admin = createAdminClient()

  // ── Step 1: Account fields ────────────────────────────────────────────────
  log('syncAccountStats', 'Fetching account fields')

  const accountRes = await fetch(
    `${FB_API}/${igUserId}?fields=id,username,name,followers_count,media_count,profile_picture_url&access_token=${token}`
  )

  if (!accountRes.ok) {
    const body = await accountRes.text()
    logError('syncAccountStats', `Account fields request failed (${accountRes.status})`, body)
    throw new Error(`Account fields fetch failed: ${accountRes.status} ${body}`)
  }

  const account = await accountRes.json() as AccountFields & { error?: { message: string } }

  if (account.error) {
    logError('syncAccountStats', 'Graph API error on account fields', account.error)
    throw new Error(`Graph API error: ${account.error.message}`)
  }

  log('syncAccountStats', 'Account fields received', {
    username:        account.username,
    followers_count: account.followers_count,
    media_count:     account.media_count,
  })

  // ── Step 2: Upsert instagram_accounts ────────────────────────────────────
  const { error: accountUpsertError } = await admin
    .from('instagram_accounts')
    .upsert(
      {
        creator_id:          creatorId,
        ig_user_id:          account.id,
        username:            account.username            ?? null,
        name:                account.name                ?? null,
        profile_picture_url: account.profile_picture_url ?? null,
        followers_count:     account.followers_count     ?? null,
        media_count:         account.media_count         ?? null,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: 'creator_id' }
    )

  if (accountUpsertError) {
    logError('syncAccountStats', 'instagram_accounts upsert failed', accountUpsertError)
    throw new Error(`instagram_accounts upsert failed: ${accountUpsertError.message}`)
  }

  log('syncAccountStats', 'instagram_accounts upserted')

  // ── Step 3: Insights — four parallel calls ───────────────────────────────
  //
  // A) Daily time-series: reach + follower_count over 30 days.
  //    Populates per-day rows (follower chart) and is summed for reach_7d/30d.
  //    Note: reach does NOT support period=week/month, so we sum daily values.
  //
  // B) reach 7-day window: separate call so we sum exactly 7 days of data.
  //
  // C/D) profile_views, website_clicks, accounts_engaged via total_value
  //    for the 7-day and 30-day windows (period=day is compatible here).

  const now      = Date.now()
  const since30d = Math.floor((now - 30 * 24 * 60 * 60 * 1000) / 1000)
  const since7d  = Math.floor((now -  7 * 24 * 60 * 60 * 1000) / 1000)
  const untilTs  = Math.floor(now / 1000)
  const todayStr = new Date().toISOString().split('T')[0]

  log('syncAccountStats', 'Fetching insights (4 calls in parallel)')

  async function fetchInsights(
    metricNames: string,
    metricType:  'time_series' | 'total_value',
    sinceTs:     number,
    label:       string,
  ): Promise<InsightMetric[]> {
    const url = new URL(`${FB_API}/${igUserId}/insights`)
    url.searchParams.set('metric',       metricNames)
    url.searchParams.set('period',       'day')
    url.searchParams.set('metric_type',  metricType)
    url.searchParams.set('since',        String(sinceTs))
    url.searchParams.set('until',        String(untilTs))
    url.searchParams.set('access_token', token)

    const res = await fetch(url.toString())
    if (!res.ok) {
      const body = await res.text()
      logError('syncAccountStats', `Insights request failed (${res.status}) [${label}]`, body)
      throw new Error(`Insights fetch failed [${label}]: ${res.status} ${body}`)
    }

    const json = await res.json() as InsightsResponse
    if (json.error) {
      logError('syncAccountStats', `Graph API error [${label}]`, json.error)
      throw new Error(`Graph API insights error [${label}]: ${json.error.message}`)
    }

    return json.data ?? []
  }

  function sumTimeSeries(metrics: InsightMetric[], name: string): number | null {
    const m = metrics.find((x) => x.name === name) as TimeSeriesMetric | undefined
    if (!m?.values?.length) return null
    return m.values.reduce((acc, v) => acc + (typeof v.value === 'number' ? v.value : 0), 0)
  }

  function totalValueOf(metrics: InsightMetric[], name: string): number | null {
    const m = metrics.find((x) => x.name === name) as TotalValueMetric | undefined
    const v = m?.total_value?.value
    return typeof v === 'number' ? v : null
  }

  // A–D: core insight calls. E: daily follows/unfollows breakdown (non-critical).
  const [
    dailyTs,       // A — reach, follower_count over 30 days
    reach7dTs,     // B — reach over 7 days (summed below)
    totalValue7d,  // C — profile_views, website_clicks, accounts_engaged, 7-day window
    totalValue30d, // D — same, 30-day window
    followsUnfollowsTs, // E — daily follows/unfollows (may be null if unsupported)
  ] = await Promise.all([
    fetchInsights('reach,follower_count',                          'time_series', since30d, 'daily-ts'),
    fetchInsights('reach',                                         'time_series', since7d,  'reach-7d'),
    fetchInsights('profile_views,website_clicks,accounts_engaged', 'total_value', since7d,  'tv-7d'),
    fetchInsights('profile_views,website_clicks,accounts_engaged', 'total_value', since30d, 'tv-30d'),
    // follows/unfollows is non-critical — catch separately so it never breaks the core sync
    (async (): Promise<InsightMetric[]> => {
      try {
        return await fetchInsights('follows,unfollows', 'time_series', since30d, 'follows-unfollows')
      } catch {
        return []
      }
    })(),
  ])

  log('syncAccountStats', 'All insight calls complete')

  // reach: sum daily values for each window (only supported method for reach)
  const reach7d  = sumTimeSeries(reach7dTs, 'reach')
  const reach30d = sumTimeSeries(dailyTs,   'reach')   // 30d data already fetched in call A

  // profile_views / accounts_engaged: total_value gives us one aggregate per window
  const profileViews7d  = totalValueOf(totalValue7d,  'profile_views')
  const profileViews30d = totalValueOf(totalValue30d, 'profile_views')
  const engaged7d       = totalValueOf(totalValue7d,  'accounts_engaged')
  const engaged30d      = totalValueOf(totalValue30d, 'accounts_engaged')
  // website_clicks fetched but no KPI card yet

  log('syncAccountStats', 'Period totals extracted', {
    reach7d, reach30d,
    profileViews7d, profileViews30d,
    engaged7d, engaged30d,
  })

  // ── Step 4: Pivot daily data and upsert snapshots ─────────────────────────
  // Include follows/unfollows time_series in the pivot so each day row gets
  // the daily follow and unfollow counts (both may be 0 if unsupported).
  const byDate = pivotInsightsByDate([...dailyTs, ...followsUnfollowsTs], [])
  const dates  = Object.keys(byDate)

  log('syncAccountStats', `Pivoted into ${dates.length} daily snapshot(s)`)

  if (dates.length === 0) {
    log('syncAccountStats', 'No snapshot data to write — skipping upsert')
    return
  }

  // ── Step 4b: Follower source breakdown (best-effort, non-critical) ─────────
  // Fetches how many new followers came from Reels, Feed, Profile, etc.
  // Stored as JSONB. Silently skipped if unavailable (requires extra permissions).
  let followerSource: Record<string, number> | null = null
  try {
    const srcUrl = new URL(`${FB_API}/${igUserId}/insights`)
    srcUrl.searchParams.set('metric',       'follower_demographics')
    srcUrl.searchParams.set('period',       'lifetime')
    srcUrl.searchParams.set('metric_type',  'total_value')
    srcUrl.searchParams.set('breakdown',    'follow_type')
    srcUrl.searchParams.set('access_token', token)

    const srcRes  = await fetch(srcUrl.toString())
    const srcJson = await srcRes.json() as InsightsResponse & {
      data?: Array<{
        name: string
        total_value?: {
          breakdowns?: Array<{
            dimension_keys: string[]
            results: Array<{ dimension_values: string[]; value: number }>
          }>
        }
      }>
    }

    if (!srcJson.error) {
      const metric = srcJson.data?.find((m) => m.name === 'follower_demographics')
      const breakdown = metric?.total_value?.breakdowns?.[0]
      if (breakdown) {
        followerSource = {}
        for (const r of breakdown.results) {
          const key = r.dimension_values[0] ?? 'UNKNOWN'
          followerSource[key] = r.value
        }
      }
    }
  } catch {
    // follower_demographics unavailable — no-op
  }

  log('syncAccountStats', 'Follower source', followerSource ?? 'unavailable')

  // Upsert 1: daily time-series rows (reach + follower delta + unfollows per day)
  const snapshots = dates.map((date) => ({
    creator_id:      creatorId,
    date,
    followers_count: byDate[date].follower_count ?? null,
    reach:           byDate[date].reach          ?? null,
    unfollows:       byDate[date].unfollows       ?? null,
  }))

  const { error: snapshotUpsertError } = await admin
    .from('instagram_account_snapshots')
    .upsert(snapshots, { onConflict: 'creator_id,date' })

  if (snapshotUpsertError) {
    logError('syncAccountStats', 'instagram_account_snapshots upsert failed', snapshotUpsertError)
    throw new Error(`Snapshots upsert failed: ${snapshotUpsertError.message}`)
  }

  log('syncAccountStats', `${snapshots.length} daily snapshot(s) written`)

  // Upsert 2: period totals on today's date row.
  //
  // The Instagram API only returns data up to yesterday, so the daily rows
  // above never include today's date. We write a separate row for today that
  // carries the 7d/30d period totals — this is always the newest row
  // (snapshots[0] on the dashboard) and is what the KPI cards read from.
  const { error: periodTotalsError } = await admin
    .from('instagram_account_snapshots')
    .upsert(
      {
        creator_id:           creatorId,
        date:                 todayStr,
        reach_7d:             reach7d,
        reach_30d:            reach30d,
        profile_views_7d:     profileViews7d,
        profile_views_30d:    profileViews30d,
        accounts_engaged_7d:  engaged7d,
        accounts_engaged_30d: engaged30d,
        ...(followerSource ? { follower_source: followerSource } : {}),
      },
      { onConflict: 'creator_id,date' },
    )

  if (periodTotalsError) {
    logError('syncAccountStats', 'period totals upsert failed', periodTotalsError)
    throw new Error(`Period totals upsert failed: ${periodTotalsError.message}`)
  }

  log('syncAccountStats', `Sync complete — period totals written to ${todayStr}`, {
    reach7d, reach30d, profileViews7d, profileViews30d, engaged7d, engaged30d,
  })
}

// ── Public entry point ────────────────────────────────────────────────────────

export type SyncResult =
  | { success: true;  last_sync: string; post_count: number; story_count: number }
  | { success: false; error: string }

/**
 * Runs a full sync for a creator and returns a typed result object.
 * Safe to call from API routes or cron jobs — never throws.
 *
 * Sync order:
 *   1. Account stats  (fast — a few API calls)
 *   2. Posts          (slow — paginates up to hundreds of posts + per-post insights)
 *   3. Stories        (fast — at most ~20 active stories)
 *
 * Kept sequential to avoid hammering the Graph API rate limits.
 */
export async function triggerFullSync(creatorId: string): Promise<SyncResult> {
  try {
    await syncAccountStats(creatorId)
    const { postCount } = await syncPosts(creatorId)
    const storiesOutcome = await syncStories(creatorId)
    const storyCount = storiesOutcome.success ? storiesOutcome.synced_count : 0

    if (!storiesOutcome.success) {
      // Log the stories failure but don't fail the whole sync — stories are
      // supplemental and may be unavailable (e.g. no active stories, missing scope).
      logError('triggerFullSync', 'Stories sync failed (non-fatal)', storiesOutcome.error)
    }

    return {
      success:     true,
      last_sync:   new Date().toISOString(),
      post_count:  postCount,
      story_count: storyCount,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logError('triggerFullSync', 'Sync failed', message)
    return { success: false, error: message }
  }
}
