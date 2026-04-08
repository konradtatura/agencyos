import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import SyncBar from './sync-bar'
import InstagramTabs from './instagram-tabs'
import KpiGrid, { type IgAccount, type Snapshot } from './kpi-grid'
import FollowerChart from './follower-chart'
import ReachChart from './reach-chart'
import EngagementRateChart, { type PostEngPoint } from './engagement-rate-chart'
import PostingCadenceChart, { type CadencePoint } from './posting-cadence-chart'
import NetFollowersChart from './net-followers-chart'
import FollowerSourceBreakdown from './follower-source-breakdown'
import ContentFunnelChart, { type FunnelData } from './content-funnel-chart'
import ExportButton from './export-button'

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000

export default async function InstagramPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const admin = createAdminClient()

  // ── Resolve creator profile ───────────────────────────────────────────────
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  // ── Integration status ────────────────────────────────────────────────────
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

  // ── Last sync timestamp ───────────────────────────────────────────────────
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
    ? new Date(new Date(last_sync).getTime() + SYNC_INTERVAL_MS).toISOString()
    : null

  // ── Account row ───────────────────────────────────────────────────────────
  const { data: igAccount } = (profile && connected)
    ? await admin
        .from('instagram_accounts')
        .select('followers_count, media_count, username, name, profile_picture_url')
        .eq('creator_id', profile.id)
        .maybeSingle()
    : { data: null }

  // ── Synced post count ─────────────────────────────────────────────────────
  const { count: syncedPostCount } = (profile && connected)
    ? await admin
        .from('instagram_posts')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', profile.id)
    : { count: null }

  // ── 60 days of snapshots (for 30d current + 30d previous comparison) ──────
  const { data: rawSnapshots } = (profile && connected && igAccount)
    ? await admin
        .from('instagram_account_snapshots')
        .select('date, followers_count, reach, unfollows, reach_7d, reach_30d, profile_views_7d, profile_views_30d, accounts_engaged_7d, accounts_engaged_30d, website_clicks_7d, website_clicks_30d, follower_source')
        .eq('creator_id', profile.id)
        .order('date', { ascending: false })
        .limit(90)
    : { data: null }

  const snapshots: Snapshot[] = (rawSnapshots ?? []) as Snapshot[]

  // ── Post engagement + cadence data ───────────────────────────────────────
  let engData:      PostEngPoint[] = []
  let engAllTimeAvg: number | null = null
  let cadenceData:  CadencePoint[] = []
  let cadenceAvg    = 0
  let funnelData:   FunnelData = {
    views_7d: null, views_30d: null,
    profile_visits_7d: null, profile_visits_30d: null,
    website_clicks_7d: null, website_clicks_30d: null,
    new_followers_7d: null,  new_followers_30d: null,
  }

  if (profile && connected && igAccount) {
    const { data: posts } = await admin
      .from('instagram_posts')
      .select('id, posted_at')
      .eq('creator_id', profile.id)
      .order('posted_at', { ascending: false })

    if (posts && posts.length > 0) {
      const postIds = posts.map((p) => p.id)

      const { data: metricsRaw } = await admin
        .from('instagram_post_metrics')
        .select('post_id, reach, like_count, comments_count, saved, shares, views, synced_at')
        .in('post_id', postIds)
        .order('synced_at', { ascending: false })

      // Keep only the latest metrics snapshot per post
      const metricsMap = new Map<string, { reach: number | null; like_count: number | null; comments_count: number | null; saved: number | null; shares: number | null; views: number | null }>()
      for (const m of metricsRaw ?? []) {
        if (!metricsMap.has(m.post_id)) metricsMap.set(m.post_id, m)
      }

      // Weekly engagement: SUM(interactions) / SUM(reach) × 100 per ISO week
      // (ratio of totals per week, not average of per-post rates)
      const weekBuckets = new Map<string, { interactions: number; reach: number; count: number }>()
      let totalInteractions = 0
      let totalReach = 0

      for (const post of posts) {
        const m = metricsMap.get(post.id)
        if (!m || m.reach == null || m.reach === 0) continue
        const interactions =
          (m.like_count ?? 0) + (m.comments_count ?? 0) + (m.saved ?? 0) + (m.shares ?? 0)

        totalInteractions += interactions
        totalReach       += m.reach

        // ISO week start = Monday of the post's week
        const d = new Date(post.posted_at)
        const dow = d.getUTCDay() // 0=Sun
        const toMonday = dow === 0 ? 6 : dow - 1
        d.setUTCDate(d.getUTCDate() - toMonday)
        const weekStart = d.toISOString().split('T')[0]

        const bucket = weekBuckets.get(weekStart) ?? { interactions: 0, reach: 0, count: 0 }
        bucket.interactions += interactions
        bucket.reach        += m.reach
        bucket.count        += 1
        weekBuckets.set(weekStart, bucket)
      }

      // All-time average (SUM/SUM across all posts)
      if (totalReach > 0) {
        engAllTimeAvg = (totalInteractions / totalReach) * 100
      }

      // Build sorted weekly engagement points (oldest → newest)
      engData = Array.from(weekBuckets.entries())
        .map(([weekStart, b]) => ({
          weekStart,
          avgEngRate: (b.interactions / b.reach) * 100,
          postCount:  b.count,
        }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

      // ── Posting cadence: last 12 weeks, one bar per week ───────────────
      // Find Monday of the current week
      const now = new Date()
      const todayDow = now.getUTCDay()
      const daysToMonday = todayDow === 0 ? 6 : todayDow - 1
      const thisMonday = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday,
      ))

      // Generate 12 buckets (index 0 = 11 weeks ago, index 11 = this week)
      const cadenceMap = new Map<string, number>()
      for (let i = 11; i >= 0; i--) {
        const d = new Date(thisMonday)
        d.setUTCDate(thisMonday.getUTCDate() - i * 7)
        cadenceMap.set(d.toISOString().split('T')[0], 0)
      }

      // Count posts per bucket
      for (const post of posts) {
        const d = new Date(post.posted_at)
        const pdow = d.getUTCDay()
        const pToMonday = pdow === 0 ? 6 : pdow - 1
        d.setUTCDate(d.getUTCDate() - pToMonday)
        d.setUTCHours(0, 0, 0, 0)
        const key = d.toISOString().split('T')[0]
        if (cadenceMap.has(key)) cadenceMap.set(key, cadenceMap.get(key)! + 1)
      }

      // Net new followers per week from account snapshots (followers_count = daily delta)
      const followersByWeek = new Map<string, number>()
      for (const snap of snapshots) {
        if (snap.followers_count == null) continue
        const d = new Date(snap.date + 'T00:00:00Z')
        const sdow = d.getUTCDay()
        const sToMonday = sdow === 0 ? 6 : sdow - 1
        d.setUTCDate(d.getUTCDate() - sToMonday)
        const key = d.toISOString().split('T')[0]
        if (cadenceMap.has(key)) {
          followersByWeek.set(key, (followersByWeek.get(key) ?? 0) + snap.followers_count)
        }
      }

      cadenceData = Array.from(cadenceMap.entries())
        .map(([weekStart, count]) => ({
          weekStart,
          count,
          newFollowers: followersByWeek.has(weekStart) ? (followersByWeek.get(weekStart) ?? null) : null,
        }))
      cadenceAvg = cadenceData.reduce((s, p) => s + p.count, 0) / cadenceData.length

      // ── Funnel: SUM(views) for posts within last 7d / 30d ─────────────
      const now7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString()
      const now30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      let views7 = 0, views30 = 0
      for (const post of posts) {
        const m = metricsMap.get(post.id)
        const v = m?.views ?? null
        if (v == null) continue
        if (post.posted_at >= now7d)  views7  += v
        if (post.posted_at >= now30d) views30 += v
      }

      // Net new followers from daily snapshot deltas (followers_count = daily net delta)
      const newFollowers7  = snapshots.slice(0,  7).reduce((s, r) => s + (r.followers_count ?? 0), 0)
      const newFollowers30 = snapshots.slice(0, 30).reduce((s, r) => s + (r.followers_count ?? 0), 0)

      // Period-total profile visits + website clicks come from the latest snapshot row
      const latestSnap = snapshots[0] ?? null
      funnelData = {
        views_7d:           views7  > 0 ? views7  : null,
        views_30d:          views30 > 0 ? views30 : null,
        profile_visits_7d:  latestSnap?.profile_views_7d   ?? null,
        profile_visits_30d: latestSnap?.profile_views_30d  ?? null,
        website_clicks_7d:  latestSnap?.website_clicks_7d  ?? null,
        website_clicks_30d: latestSnap?.website_clicks_30d ?? null,
        new_followers_7d:   newFollowers7,
        new_followers_30d:  newFollowers30,
      }
    }
  }

  const hasData  = !!igAccount
  const autoSync = connected && !hasData

  const syncStatus = { connected, ig_username, last_sync, next_sync }

  // ── Account initials fallback ─────────────────────────────────────────────
  const displayName = igAccount?.name ?? ig_username ?? ''
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div>
      <PageHeader
        title="Instagram Analytics"
        subtitle={ig_username ? `@${ig_username}` : 'Connect Instagram in Settings to get started.'}
      >
        {connected && hasData && <ExportButton />}
      </PageHeader>

      <SyncBar initial={syncStatus} autoSync={autoSync} />

      <div className="mt-4">
        <InstagramTabs activePath="/dashboard/instagram" />
      </div>

      {connected && hasData && igAccount ? (
        <div className="mt-6 space-y-8">
          {/* ── Section 1: Account Header ──────────────────────────────── */}
          <div
            className="flex flex-wrap items-center gap-5 rounded-xl px-6 py-5"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Profile picture / initials fallback */}
            <div className="shrink-0">
              {igAccount.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={igAccount.profile_picture_url}
                  alt={displayName}
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full object-cover"
                  style={{ border: '2px solid rgba(255,255,255,0.08)' }}
                />
              ) : (
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-[18px] font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                    border: '2px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {initials || '?'}
                </div>
              )}
            </div>

            {/* Name + username */}
            <div className="min-w-0 flex-1">
              {igAccount.name && (
                <p className="truncate text-[16px] font-semibold text-[#f9fafb]">{igAccount.name}</p>
              )}
              {igAccount.username && (
                <p className="text-[13px] text-[#9ca3af]">@{igAccount.username}</p>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex shrink-0 items-center gap-6">
              <div className="text-center">
                <p className="font-mono text-[20px] font-bold text-[#f9fafb]">
                  {igAccount.followers_count != null
                    ? igAccount.followers_count >= 1_000_000
                      ? `${(igAccount.followers_count / 1_000_000).toFixed(1)}M`
                      : igAccount.followers_count >= 1_000
                      ? `${(igAccount.followers_count / 1_000).toFixed(1)}K`
                      : igAccount.followers_count.toLocaleString()
                    : '—'}
                </p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-[#6b7280]">Followers</p>
              </div>

              <div className="h-8 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

              <div className="text-center">
                <p className="font-mono text-[20px] font-bold text-[#f9fafb]">
                  {igAccount.media_count?.toLocaleString() ?? '—'}
                </p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-[#6b7280]">Posts</p>
              </div>

              <div className="h-8 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

              {/* Synced content library stat */}
              {syncedPostCount != null && syncedPostCount > 0 ? (
                <div className="text-center">
                  <p className="font-mono text-[20px] font-bold text-[#f9fafb]">
                    {syncedPostCount.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-[#6b7280]">Synced</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-[12px] font-medium text-[#6b7280]">Posts not synced yet</p>
                  <a
                    href="/dashboard/instagram/content"
                    className="mt-1 inline-block text-[11px] font-semibold"
                    style={{ color: '#60a5fa' }}
                  >
                    Sync Now →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: KPI Grid ────────────────────────────────────── */}
          <KpiGrid
            account={igAccount as IgAccount}
            snapshots={snapshots}
          />

          {/* ── Section 3: Follower Growth Chart ───────────────────────── */}
          <FollowerChart
            snapshots={snapshots}
            totalFollowers={igAccount.followers_count ?? null}
          />

          {/* ── Section 3b: Daily Reach Chart ──────────────────────────── */}
          <ReachChart snapshots={snapshots} />

          {/* ── Section 3c: Content Funnel ─────────────────────────────── */}
          <ContentFunnelChart data={funnelData} />

          {/* ── Section 3d: Engagement Rate + Posting Cadence ─────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <EngagementRateChart data={engData} allTimeAvg={engAllTimeAvg} />
            <PostingCadenceChart data={cadenceData} avgPerWeek={cadenceAvg} />
          </div>

          {/* ── Section 4: Net Followers + Source ──────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <NetFollowersChart snapshots={snapshots} />
            </div>
            <FollowerSourceBreakdown snapshots={snapshots} />
          </div>
        </div>
      ) : connected && !hasData ? (
        // ── No data yet — auto-sync is running ────────────────────────────
        <div className="mt-6 space-y-8">
          {/* Skeleton account header */}
          <div
            className="flex items-center gap-5 rounded-xl px-6 py-5"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="h-14 w-14 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
            </div>
          </div>

          {/* Skeleton KPI grid */}
          <KpiGrid
            account={{ followers_count: null, media_count: null, username: null, name: null, profile_picture_url: null }}
            snapshots={[]}
            loading
          />
        </div>
      ) : (
        // ── Not connected ─────────────────────────────────────────────────
        <div
          className="flex min-h-[40vh] items-center justify-center rounded-xl"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-center">
            <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">Instagram not connected</p>
            <p className="mb-5 text-[13px]" style={{ color: '#9ca3af' }}>
              Go to Settings to connect your Instagram Business account.
            </p>
            <a
              href="/dashboard/settings"
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
              style={{ backgroundColor: '#2563eb' }}
            >
              Go to Settings
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
