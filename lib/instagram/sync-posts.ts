/**
 * Instagram post sync service — Sprint 3.
 * Fetches all media for a creator, paginates through the full library,
 * fetches per-post insights, and upserts into instagram_posts /
 * instagram_post_metrics.
 *
 * Runs server-side only. Uses the admin client for all DB writes.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getInstagramToken } from './token'

const FB_API = 'https://graph.facebook.com/v22.0'

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'

interface MediaItem {
  id:              string
  caption?:        string
  media_type:      MediaType
  media_url?:      string
  thumbnail_url?:  string
  permalink?:      string
  timestamp:       string
  like_count?:     number
  comments_count?: number
  video_duration?: number   // seconds (float) — may or may not be returned by list endpoint
}

interface MediaPage {
  data:    MediaItem[]
  paging?: {
    cursors?: { before: string; after: string }
    next?:    string
  }
}

interface InsightNode {
  name:  string
  values?: Array<{ value: number }>
  // total_value format (some metrics)
  total_value?: { value: number }
}

interface InsightsPage {
  data:   InsightNode[]
  error?: { message: string; code: number; error_subcode?: number }
}

interface PostInsights {
  reach:              number | null
  saved:              number | null
  shares:             number | null
  views:              number | null
  total_interactions: number | null
  profile_visits:     number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string, data?: unknown) {
  console.log('[ig-sync-posts]', msg, data !== undefined ? data : '')
}

function logError(msg: string, data?: unknown) {
  console.error('[ig-sync-posts] ERROR:', msg, data !== undefined ? data : '')
}

/**
 * Fetches all pages of media for an IG user, following `paging.next` cursors.
 * Returns a flat array of up to `maxPosts` media items.
 */
async function fetchAllMedia(
  igUserId:  string,
  token:     string,
  maxPosts = 500,
): Promise<MediaItem[]> {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,video_duration'
  const all: MediaItem[] = []

  let url: string | null =
    `${FB_API}/${igUserId}/media?fields=${fields}&limit=50&access_token=${token}`

  while (url && all.length < maxPosts) {
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Media fetch failed (${res.status}): ${body}`)
    }

    const rawPage = await res.json() as Record<string, unknown>
    const page    = rawPage as unknown as MediaPage & { error?: { message: string } }

    if (page.error) {
      throw new Error(`Graph API error fetching media: ${page.error.message}`)
    }

    // ── DEBUG: log the raw API object for the first VIDEO post we encounter ──
    if (all.length === 0) {
      const rawItems = (rawPage.data ?? []) as Record<string, unknown>[]
      const firstVideo = rawItems.find((item) => item.media_type === 'VIDEO')
      if (firstVideo) {
        log('DEBUG — raw API object for first VIDEO post:', JSON.stringify(firstVideo, null, 2))
      } else {
        log('DEBUG — no VIDEO post found on first page; raw items (first 3):', JSON.stringify(rawItems.slice(0, 3), null, 2))
      }
    }
    // ── END DEBUG ─────────────────────────────────────────────────────────────

    all.push(...(page.data ?? []))
    log(`Fetched page — ${all.length} posts so far`)

    // Follow next cursor if present
    url = page.paging?.next ?? null
  }

  return all
}

/**
 * Fetches insights for a single media item.
 * Returns null values for any metric that the API doesn't support for this
 * media type or post age — never throws.
 */
async function fetchPostInsights(
  mediaId: string,
  token:   string,
): Promise<PostInsights> {
  const nullResult: PostInsights = {
    reach: null, saved: null, shares: null, views: null, total_interactions: null, profile_visits: null,
  }

  // `views` is valid for all media types in v22+ (replaces `impressions`).
  // `total_interactions` is a summary metric — may be absent on older posts.
  // `profile_visits` is NOT a valid per-post insights metric in v22 — requesting
  // it causes the entire call to return an error, silently nulling all other fields.
  const metrics = 'reach,saved,shares,views,total_interactions'

  try {
    const url =
      `${FB_API}/${mediaId}/insights?metric=${metrics}&access_token=${token}`

    const res = await fetch(url)
    const json = await res.json() as InsightsPage

    // A top-level error means the insights endpoint is completely unavailable
    // for this post (e.g. too old, or a story). Return all nulls.
    if (json.error) {
      log(`Insights unavailable for ${mediaId} (${json.error.code}): ${json.error.message}`)
      return nullResult
    }

    return {
      reach:              pickMetric(json, 'reach'),
      saved:              pickMetric(json, 'saved'),
      shares:             pickMetric(json, 'shares'),
      views:              pickMetric(json, 'views'),
      total_interactions: pickMetric(json, 'total_interactions'),
      profile_visits:     pickMetric(json, 'profile_visits'),
    }
  } catch (err) {
    logError(`fetchPostInsights(${mediaId})`, err)
    return nullResult
  }
}

/** Extracts a single numeric value from an InsightsPage by metric name. */
function pickMetric(json: InsightsPage, name: string): number | null {
  const node = (json.data ?? []).find((n) => n.name === name)
  if (!node) return null
  if (node.total_value !== undefined) return node.total_value.value ?? null
  return node.values?.[0]?.value ?? null
}

/**
 * Fetches the `follows` metric for a single VIDEO media item.
 * Only valid for VIDEO (Reels) — silently returns null for any API error.
 * Never throws; never affects the main metrics sync.
 */
async function fetchFollowsCount(mediaId: string, token: string): Promise<number | null> {
  try {
    const res  = await fetch(`${FB_API}/${mediaId}/insights?metric=follows&access_token=${token}`)
    const json = await res.json() as InsightsPage
    if (json.error) return null
    return pickMetric(json, 'follows')
  } catch {
    return null
  }
}

/**
 * Fetches the replay count for a Reel (`clips_replays_count`).
 * Only valid for VIDEO; silently returns null for any error.
 */
async function fetchReplayCount(mediaId: string, token: string): Promise<number | null> {
  try {
    const res  = await fetch(`${FB_API}/${mediaId}/insights?metric=clips_replays_count&access_token=${token}`)
    const json = await res.json() as InsightsPage
    if (json.error) return null
    return pickMetric(json, 'clips_replays_count')
  } catch {
    return null
  }
}

/**
 * Fetches the average watch time for a Reel (`ig_reels_avg_watch_time`).
 * The API returns the value in milliseconds — stored as-is (integer ms).
 * Display layer divides by 1000 to show seconds.
 * Only valid for VIDEO; silently returns null for any error.
 */
async function fetchAvgWatchTime(mediaId: string, token: string): Promise<number | null> {
  try {
    const res  = await fetch(`${FB_API}/${mediaId}/insights?metric=ig_reels_avg_watch_time&access_token=${token}`)
    const json = await res.json() as InsightsPage
    if (json.error) return null
    return pickMetric(json, 'ig_reels_avg_watch_time')   // raw ms — integer
  } catch {
    return null
  }
}

/**
 * Fetches video_duration for a single Reel via the individual media endpoint.
 * The list endpoint (/user/media) does not return video_duration — a separate
 * per-media call is required. Returns seconds as a float (e.g. 15.366).
 * Only called for VIDEO posts; silently returns null on any error.
 */
async function fetchVideoDuration(mediaId: string, token: string): Promise<number | null> {
  try {
    const res  = await fetch(`${FB_API}/${mediaId}?fields=id,video_duration&access_token=${token}`)
    const json = await res.json() as Record<string, unknown>
    log(`fetchVideoDuration(${mediaId}) raw response:`, JSON.stringify(json))
    if (json.error || json.video_duration == null) return null
    const value = json.video_duration as number
    log(`fetchVideoDuration(${mediaId}) returning: ${value}`)
    return value
  } catch (err) {
    log(`fetchVideoDuration(${mediaId}) threw:`, err)
    return null
  }
}

/**
 * Fetches supplemental metrics available for all post types:
 * `reposts_count`               — number of times this post was reposted.
 * `non_follower_accounts_reached` — unique non-follower accounts reached.
 * Silently returns nulls if the metrics are unavailable for this post.
 */
async function fetchPostSupplementalMetrics(
  mediaId: string,
  token:   string,
): Promise<{ reposts_count: number | null; non_follower_reach: number | null }> {
  const empty = { reposts_count: null, non_follower_reach: null }
  try {
    const res  = await fetch(
      `${FB_API}/${mediaId}/insights?metric=reposts_count,non_follower_accounts_reached&access_token=${token}`
    )
    const json = await res.json() as InsightsPage
    if (json.error) return empty
    return {
      reposts_count:    pickMetric(json, 'reposts_count'),
      non_follower_reach: pickMetric(json, 'non_follower_accounts_reached'),
    }
  } catch {
    return empty
  }
}

// ── Core sync ─────────────────────────────────────────────────────────────────

/**
 * Fetches all media + insights for a creator and upserts into:
 *   instagram_posts         — one row per IG media item
 *   instagram_post_metrics  — one metrics row per post per sync date
 */
export async function syncPosts(
  creatorId:   string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ postCount: number }> {
  log('Starting post sync', { creatorId })

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

  const admin = createAdminClient()

  // ── Step 1: Paginate through all media ────────────────────────────────────
  log('Fetching media pages')
  const media = await fetchAllMedia(igUserId, token)
  log(`Total media fetched: ${media.length}`)

  if (media.length === 0) {
    log('No media found — skipping upsert')
    return { postCount: 0 }
  }

  // ── Step 2: Upsert instagram_posts ────────────────────────────────────────
  // Split into new vs existing so we NEVER overwrite transcript_status on
  // existing posts — only new inserts get transcript_status = 'none'.
  const { data: existingPostsData } = await admin
    .from('instagram_posts')
    .select('id, ig_media_id')
    .eq('creator_id', creatorId)

  const existingIgIds = new Set(
    (existingPostsData ?? []).map((p) => p.ig_media_id as string)
  )

  const newMedia      = media.filter((m) => !existingIgIds.has(m.id))
  const existingMedia = media.filter((m) =>  existingIgIds.has(m.id))

  // New posts only — set transcript_status: 'none' on first insert
  const newPostRows = newMedia.map((m) => ({
    creator_id:        creatorId,
    ig_media_id:       m.id,
    caption:           m.caption         ?? null,
    media_type:        m.media_type,
    media_url:         m.media_url       ?? null,
    thumbnail_url:     m.thumbnail_url   ?? null,
    permalink:         m.permalink       ?? null,
    posted_at:         m.timestamp,
    transcript_status: 'none' as const,
    video_duration:    m.video_duration  ?? null,
  }))

  // Existing posts — update metadata only, never touch transcript_status.
  // video_duration is intentionally excluded: the list endpoint never returns it,
  // so including it would overwrite a previously-saved value with null on every sync.
  // Step 3b handles writing fresh video_duration values via individual UPDATE calls.
  const existingPostRows = existingMedia.map((m) => ({
    creator_id:    creatorId,
    ig_media_id:   m.id,
    caption:       m.caption         ?? null,
    media_type:    m.media_type,
    media_url:     m.media_url       ?? null,
    thumbnail_url: m.thumbnail_url   ?? null,
    permalink:     m.permalink       ?? null,
    posted_at:     m.timestamp,
  }))

  let insertedRows: Array<{ id: string; ig_media_id: string }> = []
  if (newPostRows.length > 0) {
    const { data, error } = await admin
      .from('instagram_posts')
      .insert(newPostRows)
      .select('id, ig_media_id')
    if (error) {
      logError('instagram_posts insert failed', error)
      throw new Error(`instagram_posts insert failed: ${error.message}`)
    }
    insertedRows = (data ?? []) as typeof insertedRows
    log(`instagram_posts inserted — ${insertedRows.length} new rows`)
  }

  if (existingPostRows.length > 0) {
    const { error } = await admin
      .from('instagram_posts')
      .upsert(existingPostRows, { onConflict: 'ig_media_id' })
    if (error) {
      logError('instagram_posts upsert failed', error)
      throw new Error(`instagram_posts upsert failed: ${error.message}`)
    }
    log(`instagram_posts upserted — ${existingPostRows.length} existing rows`)
  }

  // Build a map from ig_media_id → internal UUID for the metrics upsert.
  // Use the pre-fetched existingPostsData (already has all IDs) + newly
  // inserted rows. Do NOT rely on the upsert return value — Supabase/PostgREST
  // often returns empty data for ON CONFLICT DO UPDATE operations.
  const idMap = new Map<string, string>()
  for (const p of existingPostsData ?? []) {
    idMap.set(p.ig_media_id as string, p.id as string)
  }
  for (const r of insertedRows) {
    idMap.set(r.ig_media_id, r.id)
  }

  // ── Step 3: Fetch insights in parallel (batches of 10 to respect rate limits)
  const BATCH = 10
  const syncedAt   = new Date().toISOString()
  const syncedDate = syncedAt.split('T')[0]   // "YYYY-MM-DD"
  const metricsRows: Array<{
    post_id:               string
    synced_at:             string
    synced_date:           string
    reach:                 number | null
    saved:                 number | null
    shares:                number | null
    views:                 number | null
    like_count:            number | null
    comments_count:        number | null
    total_interactions:    number | null
    profile_visits:        number | null
    follows_count:         number | null
    replays_count:         number | null
    avg_watch_time_ms:     number | null   // raw ms from API
    skip_rate:             number | null
    reposts_count:         number | null
    non_follower_reach:    number | null
    // Optional — set when preserving a manually-entered value
    follows_count_manual?:  boolean
    skip_rate_manual?:      boolean
    avg_watch_time_manual?: boolean
  }> = []

  // video_duration updates for instagram_posts — collected across all batches
  const videoDurationUpdates: Array<{ id: string; video_duration: number }> = []

  for (let i = 0; i < media.length; i += BATCH) {
    const batch = media.slice(i, i + BATCH)

    // All supplemental fetch functions are isolated in their own try/catch and
    // return null on any error — they can never break the main metrics sync.
    const [insights, followsCounts, replayCounts, avgWatchTimes, videoDurations, supplemental] = await Promise.all([
      Promise.all(batch.map((m) => fetchPostInsights(m.id, token))),
      Promise.all(batch.map((m) =>
        m.media_type === 'VIDEO' ? fetchFollowsCount(m.id, token) : Promise.resolve(null)
      )),
      Promise.all(batch.map((m) =>
        m.media_type === 'VIDEO' ? fetchReplayCount(m.id, token) : Promise.resolve(null)
      )),
      Promise.all(batch.map((m) =>
        m.media_type === 'VIDEO' ? fetchAvgWatchTime(m.id, token) : Promise.resolve(null)
      )),
      // video_duration: use list-endpoint value if present, else fetch individually
      Promise.all(batch.map((m) => {
        if (m.media_type !== 'VIDEO') return Promise.resolve(null)
        if (m.video_duration != null) {
          log(`video_duration from list endpoint for ${m.id}: ${m.video_duration}`)
          return Promise.resolve(m.video_duration)
        }
        log(`video_duration not in list response for ${m.id} — fetching individually`)
        return fetchVideoDuration(m.id, token)
      })),
      Promise.all(batch.map((m) => fetchPostSupplementalMetrics(m.id, token))),
    ])

    for (let j = 0; j < batch.length; j++) {
      const m       = batch[j]
      const ins     = insights[j]
      const supp    = supplemental[j]
      const post_id = idMap.get(m.id)

      if (!post_id) continue   // shouldn't happen, but be defensive

      // Collect video_duration to write back to instagram_posts
      const dur = videoDurations[j]
      if (m.media_type === 'VIDEO') {
        log(`video_duration result for ${m.id} (${post_id}): ${dur ?? 'null'}`)
      }
      if (dur != null) {
        videoDurationUpdates.push({ id: post_id, video_duration: dur })
      }

      // Skip rate: % of unique accounts reached who did NOT watch the reel.
      // Only meaningful for VIDEO; null when views > reach (replay scenario).
      const isReel   = m.media_type === 'VIDEO'
      const v        = ins.views
      const r        = ins.reach
      const skipRate = (isReel && v != null && r != null && r > 0 && v <= r)
        ? ((r - v) / r) * 100
        : null

      metricsRows.push({
        post_id,
        synced_at:            syncedAt,
        synced_date:          syncedDate,
        reach:                ins.reach,
        saved:                ins.saved,
        shares:               ins.shares,
        views:                ins.views,
        like_count:           m.like_count         ?? null,
        comments_count:       m.comments_count     ?? null,
        total_interactions:   ins.total_interactions,
        profile_visits:       ins.profile_visits,
        follows_count:        followsCounts[j],
        replays_count:        replayCounts[j]      ?? null,
        avg_watch_time_ms:    avgWatchTimes[j]     ?? null,
        skip_rate:            skipRate,
        reposts_count:        supp?.reposts_count      ?? null,
        non_follower_reach:   supp?.non_follower_reach  ?? null,
      })
    }

    const fetched = Math.min(i + BATCH, media.length)
    log(`Insights fetched — ${fetched} / ${media.length}`)
    onProgress?.(fetched, media.length)
  }

  // ── Step 3b: Write video_duration back to instagram_posts ─────────────────
  // Use individual UPDATE calls (not upsert) — partial upsert with only {id, video_duration}
  // fails on NOT NULL constraints for other required columns before the ON CONFLICT path fires.
  const videoPostCount = media.filter((m) => m.media_type === 'VIDEO').length
  log(`video_duration: ${videoDurationUpdates.length} / ${videoPostCount} VIDEO posts have a value`)
  if (videoDurationUpdates.length > 0) {
    log('video_duration sample values', videoDurationUpdates.slice(0, 3))
    const results = await Promise.all(
      videoDurationUpdates.map((r) =>
        admin
          .from('instagram_posts')
          .update({ video_duration: r.video_duration })
          .eq('id', r.id)
      )
    )
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) logError(`video_duration update: ${failed.length} rows failed`, failed[0].error)
    log(`video_duration update complete — ${videoDurationUpdates.length - failed.length} rows updated`)
  } else {
    log('video_duration: no values to write — API is not returning this field for any VIDEO posts')
  }

  // ── Step 3c: Preserve manually-entered metric values ─────────────────────
  // The API returns null for follows_count and skip_rate on small accounts.
  // Before upserting, fetch the most-recent rows that have manual flags set
  // and carry those values forward so the sync never wipes manual data.
  const postIdsInSync = metricsRows.map((r) => r.post_id)
  if (postIdsInSync.length > 0) {
    const { data: existingMetrics } = await admin
      .from('instagram_post_metrics')
      .select('post_id, follows_count, follows_count_manual, skip_rate, skip_rate_manual, avg_watch_time_ms, avg_watch_time_manual')
      .in('post_id', postIdsInSync)
      .order('synced_at', { ascending: false })

    // Keep only the most-recent row per post that has any manual flag
    const manualByPost = new Map<string, {
      follows_count:         number | null
      follows_count_manual:  boolean
      skip_rate:             number | null
      skip_rate_manual:      boolean
      avg_watch_time_ms:     number | null
      avg_watch_time_manual: boolean
    }>()
    for (const row of existingMetrics ?? []) {
      if (!manualByPost.has(row.post_id)) {
        if (row.follows_count_manual || row.skip_rate_manual || row.avg_watch_time_manual) {
          manualByPost.set(row.post_id, {
            follows_count:         row.follows_count         ?? null,
            follows_count_manual:  row.follows_count_manual  ?? false,
            skip_rate:             row.skip_rate             ?? null,
            skip_rate_manual:      row.skip_rate_manual      ?? false,
            avg_watch_time_ms:     row.avg_watch_time_ms     ?? null,
            avg_watch_time_manual: row.avg_watch_time_manual ?? false,
          })
        }
      }
    }

    // Merge: if API returned null for a field that was manually entered, restore the manual value
    for (const row of metricsRows) {
      const prev = manualByPost.get(row.post_id)
      if (!prev) continue
      if (row.follows_count == null && prev.follows_count_manual && prev.follows_count != null) {
        row.follows_count          = prev.follows_count
        row.follows_count_manual   = true
      }
      if (row.skip_rate == null && prev.skip_rate_manual && prev.skip_rate != null) {
        row.skip_rate              = prev.skip_rate
        row.skip_rate_manual       = true
      }
      if (row.avg_watch_time_ms == null && prev.avg_watch_time_manual && prev.avg_watch_time_ms != null) {
        row.avg_watch_time_ms      = prev.avg_watch_time_ms
        row.avg_watch_time_manual  = true
      }
    }
  }

  // ── Step 4: Upsert instagram_post_metrics ─────────────────────────────────
  // One row per (post_id, synced_at::date) — keeps one metrics snapshot per day.
  if (metricsRows.length > 0) {
    log('metrics upsert sample row', JSON.stringify(metricsRows[0], null, 2))
  }
  const { error: metricsError } = await admin
    .from('instagram_post_metrics')
    .upsert(metricsRows, { onConflict: 'post_id,synced_date' })

  if (metricsError) {
    logError('instagram_post_metrics upsert failed', metricsError)
    throw new Error(`instagram_post_metrics upsert failed: ${metricsError.message}`)
  }

  log(`Sync complete — ${metricsRows.length} metrics rows written`)
  return { postCount: metricsRows.length }
}
