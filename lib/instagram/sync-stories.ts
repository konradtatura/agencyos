/**
 * Instagram Stories sync service — Sprint 5.
 *
 * syncStories(creatorId)
 *   1. Fetches all currently-active stories via GET /{ig_user_id}/stories
 *   2. Fetches per-story insights in parallel
 *   3. Upserts into instagram_stories
 *
 * Stories are only returned by the API while active (< 24h old). Each sync
 * captures metrics for live stories; historical rows persist in the DB from
 * prior syncs so the full archive is preserved.
 *
 * Runs server-side only. Uses the admin client for all DB writes.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getInstagramToken } from './token'

const FB_API = 'https://graph.facebook.com/v22.0'

// ── Types ─────────────────────────────────────────────────────────────────────

type StoryMediaType = 'IMAGE' | 'VIDEO'

interface StoryItem {
  id:            string
  media_type:    StoryMediaType
  media_url?:    string
  thumbnail_url?: string
  timestamp:     string
}

interface StoriesPage {
  data:    StoryItem[]
  paging?: { cursors?: { before: string; after: string }; next?: string }
  error?:  { message: string; code: number }
}

interface InsightNode {
  name:         string
  values?:      Array<{ value: number | Record<string, number> }>
  total_value?: { value: number; breakdowns?: Array<{ dimension_keys: string[]; results: Array<{ dimension_values: string[]; value: number }> }> }
}

interface InsightsPage {
  data:   InsightNode[]
  error?: { message: string; code: number; error_subcode?: number }
}

interface StoryInsights {
  views:        number | null  // API v22+ field; stored in DB impressions column
  reach:        number | null
  taps_forward: number | null
  taps_back:    number | null
  exits:        number | null
  replies:      number | null
  link_clicks:  number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string, data?: unknown) {
  console.log('[ig-sync-stories]', msg, data !== undefined ? data : '')
}

function logError(msg: string, data?: unknown) {
  console.error('[ig-sync-stories] ERROR:', msg, data !== undefined ? data : '')
}

/**
 * Extracts a single numeric metric from an insights response.
 * Handles both `total_value` and `values[0]` response shapes.
 */
function pickMetric(json: InsightsPage, name: string): number | null {
  const node = (json.data ?? []).find((n) => n.name === name)
  if (!node) return null
  if (node.total_value !== undefined) return node.total_value.value ?? null
  const v = node.values?.[0]?.value
  return typeof v === 'number' ? v : null
}

/**
 * Fetches insights for a single story.
 * `link_clicks` requires the story to have a link sticker — silently null otherwise.
 * Never throws; returns nulls for any metric that errors or is unavailable.
 */
async function fetchStoryInsights(
  storyId: string,
  token:   string,
): Promise<StoryInsights> {
  const empty: StoryInsights = {
    views:        null,
    reach:        null,
    taps_forward: null,
    taps_back:    null,
    exits:        null,
    replies:      null,
    link_clicks:  null,
  }

  try {
    const metrics = ['views', 'reach', 'replies', 'shares', 'navigation', 'profile_visits', 'total_interactions']
    const res  = await fetch(`${FB_API}/${storyId}/insights?metric=${metrics.join(',')}&access_token=${token}`)
    const json = await res.json() as InsightsPage

    if (json.error) {
      log(`fetchStoryInsights(${storyId}) API error: ${json.error.message}`)
      return empty
    }

    // navigation breakdown — values[0].value is an object keyed by action type
    const navMetric = json.data.find((m) => m.name === 'navigation')
    const navValue  = (navMetric?.values?.[0]?.value ?? {}) as Record<string, number>
    console.log('[ig-sync-stories] navigation breakdown keys:', JSON.stringify(navValue))
    const taps_forward = navValue.taps_forward ?? null
    const taps_back    = navValue.taps_back    ?? null
    const exits        = navValue.exited       ?? null

    // link_clicks lives in the navigation breakdown's total_value.breakdowns
    let link_clicks: number | null = null
    const breakdown = navMetric?.total_value?.breakdowns?.[0]
    if (breakdown) {
      const linkEntry = breakdown.results.find(
        (r) => r.dimension_values[0] === 'link_click_story',
      )
      if (linkEntry) link_clicks = linkEntry.value
    }

    const core: StoryInsights = {
      views:        pickMetric(json, 'views'),
      reach:        pickMetric(json, 'reach'),
      taps_forward,
      taps_back,
      exits,
      replies:      pickMetric(json, 'replies'),
      link_clicks,
    }

    return core
  } catch (err) {
    log(`fetchStoryInsights(${storyId}) threw:`, err)
    return empty
  }
}

// ── Core sync ─────────────────────────────────────────────────────────────────

export interface SyncStoriesResult {
  success:      true
  synced_count: number
}

export interface SyncStoriesError {
  success: false
  error:   string
}

export type SyncStoriesOutcome = SyncStoriesResult | SyncStoriesError

/**
 * Fetches all active stories for a creator, collects per-story insights,
 * and upserts into instagram_stories.
 *
 * Returns { success: true, synced_count } on success,
 * { success: false, error } on any unrecoverable failure.
 */
export async function syncStories(creatorId: string): Promise<SyncStoriesOutcome> {
  log('Starting stories sync', { creatorId })

  // ── Resolve token ────────────────────────────────────────────────────────
  const result = await getInstagramToken(creatorId)
  if (!result) {
    const error = `No valid Instagram token for creator ${creatorId}`
    logError(error)
    return { success: false, error }
  }

  const { token, integration } = result
  const igUserId = integration.meta.ig_user_id

  if (!igUserId) {
    const error = `No ig_user_id in integration meta for creator ${creatorId}`
    logError(error)
    return { success: false, error }
  }

  const admin = createAdminClient()

  // ── Step 1: Fetch active stories ─────────────────────────────────────────
  log('Fetching active stories', { igUserId })

  const fields = 'id,media_type,media_url,thumbnail_url,timestamp'
  const storiesRes = await fetch(
    `${FB_API}/${igUserId}/stories?fields=${fields}&access_token=${token}`
  )

  if (!storiesRes.ok) {
    const body  = await storiesRes.text()
    const error = `Stories fetch failed (${storiesRes.status}): ${body}`
    logError(error)
    return { success: false, error }
  }

  const storiesPage = await storiesRes.json() as StoriesPage

  if (storiesPage.error) {
    const error = `Graph API error fetching stories: ${storiesPage.error.message}`
    logError(error)
    return { success: false, error }
  }

  const stories = storiesPage.data ?? []
  log(`Fetched ${stories.length} active story/stories`)

  if (stories.length === 0) {
    log('No active stories — nothing to sync')
    return { success: true, synced_count: 0 }
  }

  // ── Step 2: Fetch insights in parallel ────────────────────────────────────
  log('Fetching insights for all stories in parallel')

  const allInsights = await Promise.all(
    stories.map((s) => fetchStoryInsights(s.id, token))
  )

  log('All story insights fetched')

  // ── Step 3: Build upsert rows ─────────────────────────────────────────────
  const rows = stories.map((s, i) => {
    const ins = allInsights[i]

    // Stories expire exactly 24 hours after they are posted
    const postedAt  = new Date(s.timestamp)
    const expiresAt = new Date(postedAt.getTime() + 24 * 60 * 60 * 1000)

    // exit_rate: exits ÷ views × 100; null when either value is missing
    const exitRate =
      ins.exits != null && ins.views != null && ins.views > 0
        ? (ins.exits / ins.views) * 100
        : null

    log(`Story ${s.id}: views=${ins.views} reach=${ins.reach} exits=${ins.exits} exit_rate=${exitRate?.toFixed(1) ?? 'null'}`)

    return {
      creator_id:    creatorId,
      ig_story_id:   s.id,
      media_type:    s.media_type,
      media_url:     s.media_url     ?? null,
      thumbnail_url: s.thumbnail_url ?? null,
      posted_at:     postedAt.toISOString(),
      expires_at:    expiresAt.toISOString(),
      impressions:   ins.views,  // views maps to the existing impressions DB column
      reach:         ins.reach,
      taps_forward:  ins.taps_forward,
      taps_back:     ins.taps_back,
      exits:         ins.exits,
      replies:       ins.replies,
      link_clicks:   ins.link_clicks,
      exit_rate:     exitRate,
    }
  })

  // ── Step 4: Upsert into instagram_stories ────────────────────────────────
  const { error: upsertError } = await admin
    .from('instagram_stories')
    .upsert(rows, { onConflict: 'ig_story_id' })

  if (upsertError) {
    logError('instagram_stories upsert failed', upsertError)
    return { success: false, error: upsertError.message }
  }

  log(`Sync complete — ${rows.length} story/stories upserted`, { creatorId })
  return { success: true, synced_count: rows.length }
}
