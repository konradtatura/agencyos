import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import SyncBar from './sync-bar'
import InstagramTabs from './instagram-tabs'
import KpiGrid, { type IgAccount, type Snapshot } from './kpi-grid'
import FollowerChart from './follower-chart'
import NetFollowersChart from './net-followers-chart'
import FollowerSourceBreakdown from './follower-source-breakdown'

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
        .select('date, followers_count, reach, unfollows, reach_7d, reach_30d, profile_views_7d, profile_views_30d, accounts_engaged_7d, accounts_engaged_30d, follower_source')
        .eq('creator_id', profile.id)
        .order('date', { ascending: false })
        .limit(90)
    : { data: null }

  const snapshots: Snapshot[] = (rawSnapshots ?? []) as Snapshot[]

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
      />

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
