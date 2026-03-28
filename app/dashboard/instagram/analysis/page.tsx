import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import SyncBar from '../sync-bar'
import InstagramTabs from '../instagram-tabs'
import AnalysisView, { type HistoryItem } from './analysis-view'
import type { ContentAnalysis } from '@/lib/analysis/content-analyzer'

export default async function AnalysisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  // ── Creator + integration ──────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const { data: integration } = profile
    ? await admin
        .from('integrations')
        .select('status, meta')
        .eq('creator_id', profile.id)
        .eq('platform', 'instagram')
        .maybeSingle()
    : { data: null }

  const connected   = integration?.status === 'active'
  const ig_username = (integration?.meta as { username?: string } | null)?.username ?? null

  // ── Sync bar data ──────────────────────────────────────────────────────────
  const { data: latestSnapshot } = (profile && connected)
    ? await admin
        .from('instagram_account_snapshots')
        .select('created_at')
        .eq('creator_id', profile.id)
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
  const { count: transcribedCount } = (profile && connected)
    ? await admin
        .from('instagram_posts')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', profile.id)
        .eq('media_type', 'VIDEO')
        .eq('transcript_status', 'done')
    : { count: 0 }

  // ── Analysis history (all, newest first) ──────────────────────────────────
  const { data: rawHistory } = profile
    ? await admin
        .from('content_analyses')
        .select('id, created_at, post_count, analysis_json')
        .eq('creator_id', profile.id)
        .eq('platform', 'instagram')
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null }

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
  const { data: weeklyRuns } = profile
    ? await admin
        .from('content_analyses')
        .select('created_at')
        .eq('creator_id', profile.id)
        .eq('platform', 'instagram')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true })
    : { data: null }

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

      <div className="mt-6">
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
