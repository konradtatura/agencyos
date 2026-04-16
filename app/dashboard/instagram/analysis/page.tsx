import { createAdminClient } from '@/lib/supabase/admin'
import { getCreatorId } from '@/lib/get-creator-id'
import PageHeader from '@/components/ui/page-header'
import SyncBar from '../sync-bar'
import InstagramTabs from '../instagram-tabs'
import AnalysisView, { type HistoryItem } from './analysis-view'
import ContentPerformanceMatrix from './content-performance-matrix'
import type { ContentAnalysis } from '@/lib/analysis/content-analyzer'
import type { PostRow } from '../content/posts-table'

export default async function AnalysisPage() {
  const admin = createAdminClient()
  const creatorId = await getCreatorId()
  if (!creatorId) return null

  // ── Integration ────────────────────────────────────────────────────────────
  const { data: integration } = await admin
        .from('integrations')
        .select('status, meta')
        .eq('creator_id', creatorId)
        .eq('platform', 'instagram')
        .maybeSingle()

  const connected   = integration?.status === 'active'
  const ig_username = (integration?.meta as { username?: string } | null)?.username ?? null

  // ── Sync bar data ──────────────────────────────────────────────────────────
  const { data: latestSnapshot } = connected
    ? await admin
        .from('instagram_account_snapshots')
        .select('created_at')
        .eq('creator_id', creatorId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const last_sync = latestSnapshot?.created_at ?? null
  const next_sync = last_sync
    ? new Date(new Date(last_sync).getTime() + 6 * 60 * 60 * 1000).toISOString()
    : null

  const syncStatus = { connected, ig_username, last_sync, next_sync }

  // ── Count transcribed reels ────────────────────────────────────────────────
  const { count: transcribedCount } = connected
    ? await admin
        .from('instagram_posts')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId)
        .eq('media_type', 'VIDEO')
        .eq('transcript_status', 'done')
    : { count: 0 }

  // ── Posts + metrics for Content Performance Matrix ────────────────────────
  const { data: rawPosts } = connected
    ? await admin
        .from('instagram_posts')
        .select('id, ig_media_id, caption, media_type, media_url, thumbnail_url, permalink, posted_at, transcript_status, is_trial, reel_group_id')
        .eq('creator_id', creatorId)
        .order('posted_at', { ascending: false })
    : { data: null }

  const matrixPostIds = (rawPosts ?? []).map((p) => p.id)

  const { data: rawMetrics } = matrixPostIds.length
    ? await admin
        .from('instagram_post_metrics')
        .select('post_id, reach, saved, shares, views, like_count, comments_count, total_interactions, profile_visits, follows_count, replays_count, avg_watch_time_ms, total_watch_time_ms, reposts_count, non_follower_reach, avg_watch_time_manual, synced_at')
        .in('post_id', matrixPostIds)
        .order('synced_at', { ascending: false })
    : { data: null }

  // Deduplicate: keep latest metrics snapshot per post
  const matrixMetricsMap = new Map<string, Record<string, unknown>>()
  for (const m of rawMetrics ?? []) {
    if (!matrixMetricsMap.has(m.post_id)) matrixMetricsMap.set(m.post_id, m as Record<string, unknown>)
  }

  const matrixRows: PostRow[] = (rawPosts ?? []).map((p) => {
    const m = matrixMetricsMap.get(p.id) ?? null
    return {
      id:             p.id,
      ig_media_id:    p.ig_media_id,
      caption:        p.caption        ?? null,
      media_type:     p.media_type     as PostRow['media_type'],
      media_url:      p.media_url      ?? null,
      thumbnail_url:  p.thumbnail_url  ?? null,
      permalink:      p.permalink      ?? null,
      posted_at:      p.posted_at,
      transcript_status: ((p.transcript_status ?? 'none') as PostRow['transcript_status']),
      is_trial:          (p as Record<string, unknown>).is_trial as boolean ?? false,
      reel_group_id:     (p as Record<string, unknown>).reel_group_id as string | null ?? null,
      reach:              m ? (m.reach as number | null ?? null)              : null,
      saved:              m ? (m.saved as number | null ?? null)              : null,
      shares:             m ? (m.shares as number | null ?? null)             : null,
      views:              m ? (m.views as number | null ?? null)              : null,
      like_count:         m ? (m.like_count as number | null ?? null)         : null,
      comments_count:     m ? (m.comments_count as number | null ?? null)     : null,
      total_interactions: m ? (m.total_interactions as number | null ?? null) : null,
      profile_visits:     m ? (m.profile_visits as number | null ?? null)     : null,
      follows_count:      m ? (m.follows_count as number | null ?? null)      : null,
      replays_count:      m ? (m.replays_count as number | null ?? null)      : null,
      avg_watch_time_ms:  m ? (m.avg_watch_time_ms as number | null ?? null)  : null,
      total_watch_time_ms: m ? (m.total_watch_time_ms as number | null ?? null) : null,
      reposts_count:      m ? (m.reposts_count as number | null ?? null)      : null,
      non_follower_reach: m ? (m.non_follower_reach as number | null ?? null) : null,
      avg_watch_time_manual: m ? (m.avg_watch_time_manual as boolean ?? false) : false,
    }
  })

  // ── Analysis history (all, newest first) ──────────────────────────────────
  const { data: rawHistory } = await admin
        .from('content_analyses')
        .select('id, created_at, post_count, analysis_json')
        .eq('creator_id', creatorId)
        .eq('platform', 'instagram')
        .order('created_at', { ascending: false })
        .limit(50)

  const history: HistoryItem[] = (rawHistory ?? []).map((row) => ({
    id:         row.id,
    created_at: row.created_at,
    post_count: row.post_count,
    analysis:   row.analysis_json as ContentAnalysis,
  }))

  const latestAnalysis   = history[0]?.analysis ?? null
  const latestHistoryId  = history[0]?.id ?? null

  // ── Rate limit: max 3 analyses per rolling 7-day window ───────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: weeklyRuns } = await admin
        .from('content_analyses')
        .select('created_at')
        .eq('creator_id', creatorId)
        .eq('platform', 'instagram')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true })

  const weeklyCount = weeklyRuns?.length ?? 0
  // Reset date = when the oldest-of-3 run drops out of the 7-day window
  const resetDate = weeklyCount >= 3
    ? new Date(new Date(weeklyRuns![0].created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null

  return (
    <div>
      <PageHeader
        title="Instagram Analytics"
        subtitle={ig_username ? `@${ig_username}` : 'Connect Instagram in Settings to get started.'}
      />

      <SyncBar initial={syncStatus} autoSync={false} />

      <div className="mt-4">
        <InstagramTabs activePath="/dashboard/instagram/analysis" />
      </div>

      <div className="mt-6 space-y-8">
        {connected && matrixRows.length > 0 && (
          <ContentPerformanceMatrix rows={matrixRows} />
        )}

        <AnalysisView
          connected={connected}
          transcribedCount={transcribedCount ?? 0}
          initialAnalysis={latestAnalysis}
          initialHistoryId={latestHistoryId}
          initialHistory={history}
          weeklyCount={weeklyCount}
          resetDate={resetDate}
        />
      </div>
    </div>
  )
}
