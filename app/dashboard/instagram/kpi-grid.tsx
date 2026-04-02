'use client'

import { useState } from 'react'
import StatCard from '@/components/ui/stat-card'
import { Users, Eye, BarChart2, Heart, MousePointerClick, TrendingUp, Target, UserCheck, Info } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IgAccount {
  followers_count:     number | null
  media_count:         number | null
  username:            string | null
  name:                string | null
  profile_picture_url: string | null
}

export interface Snapshot {
  date:             string
  followers_count:  number | null   // daily net delta from insights (used for follower chart)
  reach:            number | null   // daily reach (used for follower chart baseline)
  unfollows:        number | null   // daily unfollows (null if API unavailable)
  // Period totals — populated only on the row for the day the sync ran.
  // Use these for KPI cards; they match Instagram's native numbers exactly.
  reach_7d:             number | null
  reach_30d:            number | null
  profile_views_7d:     number | null
  profile_views_30d:    number | null
  accounts_engaged_7d:  number | null
  accounts_engaged_30d: number | null
  website_clicks_7d:    number | null
  website_clicks_30d:   number | null
  // Follower source breakdown — populated on today's row if available.
  // Keys are IG follow_type dimension values: FEED, REEL, PROFILE, HASHTAG, etc.
  follower_source:      Record<string, number> | null
}

interface Props {
  account:   IgAccount
  snapshots: Snapshot[]   // sorted newest-first, up to 60 rows
  loading?:  boolean
}

type Range = 7 | 30

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumField(rows: Snapshot[], field: keyof Snapshot): number {
  return rows.reduce((acc, r) => acc + ((r[field] as number | null) ?? 0), 0)
}

function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined
  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

// ── Range tabs ────────────────────────────────────────────────────────────────

function RangeTabs({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
      {([7, 30] as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all"
          style={
            range === r
              ? { backgroundColor: 'rgba(37,99,235,0.25)', color: '#60a5fa' }
              : { color: '#6b7280' }
          }
        >
          {r}d
        </button>
      ))}
    </div>
  )
}

// ── Individual KPI card ───────────────────────────────────────────────────────

interface KpiCardProps {
  title:   string
  info?:   string   // optional tooltip shown on the (i) icon
  compute: (snapshots: Snapshot[], range: Range, account: IgAccount) => { value: string; change?: number; changeSuffix?: string }
  icon:    React.ComponentType<{ className?: string }>
  account: IgAccount
  snapshots: Snapshot[]
  loading?: boolean
}

function KpiCard({ title, info, compute, icon, account, snapshots, loading }: KpiCardProps) {
  const [range, setRange] = useState<Range>(7)

  const previous = snapshots.slice(range, range * 2)

  const { value, change, changeSuffix } = compute(
    snapshots,
    range,
    account,
  )

  // Suppress the change indicator if there's no previous period data at all
  const hasPreviousPeriod = previous.some(
    (s) => (
      s.followers_count     ?? s.reach              ??
      s.reach_7d            ?? s.reach_30d          ??
      s.profile_views_7d    ?? s.profile_views_30d  ??
      s.accounts_engaged_7d ?? s.accounts_engaged_30d ??
      s.website_clicks_7d   ?? s.website_clicks_30d
    ) !== null
  )
  const displayChange = hasPreviousPeriod ? change : undefined

  return (
    <div>
      {/* Range tabs sit above the StatCard, visually grouped */}
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1 text-[11px] font-medium text-[#4b5563]">
          {range}d window
          {info && (
            <span title={info} className="cursor-help">
              <Info className="h-3 w-3 text-[#374151]" />
            </span>
          )}
        </span>
        <RangeTabs range={range} onChange={setRange} />
      </div>
      <StatCard
        title={title}
        value={value}
        change={displayChange}
        changeLabel={`vs prev ${range}d`}
        changeSuffix={changeSuffix}
        icon={icon as React.ComponentType<{ className?: string }> & Parameters<typeof StatCard>[0]['icon']}
        loading={loading}
      />
    </div>
  )
}

// ── Metric computations ───────────────────────────────────────────────────────

const ROLLING_NOTE = 'Rolling total — may vary slightly from Instagram\u2019s native dashboard'

const METRICS = [
  {
    title: 'Followers',
    icon:  Users,
    compute(snapshots: Snapshot[], range: Range, account: IgAccount) {
      const current  = snapshots.slice(0, range)
      const previous = snapshots.slice(range, range * 2)
      const curDelta  = sumField(current,  'followers_count')
      const prevDelta = sumField(previous, 'followers_count')
      // Show raw follower-gain difference (not a ratio) — "+47" means 47 more
      // net followers gained this period than the previous equivalent period.
      return {
        value:        fmtNum(account.followers_count),
        change:       curDelta - prevDelta,
        changeSuffix: '',
      }
    },
  },
  {
    title: 'Reach',
    info:  ROLLING_NOTE,
    icon:  Eye,
    compute(snapshots: Snapshot[], range: Range) {
      const latest = snapshots[0]
      const prior  = snapshots[range] ?? null
      const cur  = range === 7 ? (latest?.reach_7d  ?? null) : (latest?.reach_30d  ?? null)
      const prev = range === 7 ? (prior?.reach_7d   ?? null) : (prior?.reach_30d   ?? null)
      // Only show change % when the prior period row actually has data
      return { value: fmtNum(cur), change: prev !== null ? pctChange(cur ?? 0, prev) : undefined }
    },
  },
  {
    title: 'Profile Visits',
    info:  ROLLING_NOTE,
    icon:  BarChart2,
    compute(snapshots: Snapshot[], range: Range) {
      const latest = snapshots[0]
      const prior  = snapshots[range] ?? null
      const cur  = range === 7 ? (latest?.profile_views_7d  ?? null) : (latest?.profile_views_30d  ?? null)
      const prev = range === 7 ? (prior?.profile_views_7d   ?? null) : (prior?.profile_views_30d   ?? null)
      return { value: fmtNum(cur), change: prev !== null ? pctChange(cur ?? 0, prev) : undefined }
    },
  },
  {
    title: 'Accounts Engaged',
    info:  ROLLING_NOTE,
    icon:  Heart,
    compute(snapshots: Snapshot[], range: Range) {
      const latest = snapshots[0]
      const prior  = snapshots[range] ?? null
      const cur  = range === 7 ? (latest?.accounts_engaged_7d  ?? null) : (latest?.accounts_engaged_30d  ?? null)
      const prev = range === 7 ? (prior?.accounts_engaged_7d   ?? null) : (prior?.accounts_engaged_30d   ?? null)
      return { value: fmtNum(cur), change: prev !== null ? pctChange(cur ?? 0, prev) : undefined }
    },
  },
  {
    title: 'Website Clicks',
    info:  ROLLING_NOTE,
    icon:  MousePointerClick,
    compute(snapshots: Snapshot[], range: Range) {
      const latest = snapshots[0]
      const prior  = snapshots[range] ?? null
      const cur  = range === 7 ? (latest?.website_clicks_7d  ?? null) : (latest?.website_clicks_30d  ?? null)
      const prev = range === 7 ? (prior?.website_clicks_7d   ?? null) : (prior?.website_clicks_30d   ?? null)
      return { value: fmtNum(cur), change: prev !== null ? pctChange(cur ?? 0, prev) : undefined }
    },
  },
  {
    title: 'PV Rate',
    info:  'Profile visits ÷ Reach — % of accounts you reached who then visited your profile',
    icon:  Target,
    compute(snapshots: Snapshot[], range: Range) {
      const latest   = snapshots[0]
      const prior    = snapshots[range] ?? null
      // Use account-level period totals (same source as Profile Visits and Reach KPI cards)
      const curViews = range === 7 ? (latest?.profile_views_7d ?? null) : (latest?.profile_views_30d ?? null)
      const curReach = range === 7 ? (latest?.reach_7d         ?? null) : (latest?.reach_30d         ?? null)
      const prevViews = range === 7 ? (prior?.profile_views_7d ?? null) : (prior?.profile_views_30d  ?? null)
      const prevReach = range === 7 ? (prior?.reach_7d         ?? null) : (prior?.reach_30d          ?? null)

      if (curViews == null || !curReach) return { value: '—' }
      const curRate  = (curViews / curReach) * 100

      const prevRate = (prevViews != null && prevReach)
        ? (prevViews / prevReach) * 100
        : null

      const value = `${curRate.toFixed(1)}%`
      const change = prevRate !== null
        ? parseFloat((curRate - prevRate).toFixed(1))
        : undefined

      return { value, change }
    },
  },
  {
    title: 'Growth Rate',
    info:  'Net follower gain ÷ follower count at the start of the period',
    icon:  TrendingUp,
    compute(snapshots: Snapshot[], range: Range, account: IgAccount) {
      const curSlice  = snapshots.slice(0, range)
      const prevSlice = snapshots.slice(range, range * 2)
      const curNet    = sumField(curSlice,  'followers_count')
      const prevNet   = sumField(prevSlice, 'followers_count')

      // Follower count at the start of the current period
      const base = (account.followers_count ?? 0) - curNet
      if (base <= 0) return { value: '—' }

      const curRate = (curNet / base) * 100

      // Follower count at the start of the previous period
      const prevBase = base - prevNet
      const prevRate = prevBase > 0 ? (prevNet / prevBase) * 100 : null

      const sign  = curRate >= 0 ? '+' : ''
      const value = `${sign}${curRate.toFixed(1)}%`

      // Delta in percentage points (1 dp) vs the prior equivalent period
      const change = prevRate !== null
        ? parseFloat((curRate - prevRate).toFixed(1))
        : undefined

      return { value, change }
    },
  },
  {
    title: 'Follow Conv.',
    info:  'What % of profile visitors followed you. Calculated as net new followers ÷ profile views over the period.',
    icon:  UserCheck,
    compute(snapshots: Snapshot[], range: Range) {
      const curSlice  = snapshots.slice(0, range)
      const prevSlice = snapshots.slice(range, range * 2)

      // Net new followers = sum of daily deltas (followers_count is a daily net delta)
      const curFollowers  = sumField(curSlice,  'followers_count')
      const prevFollowers = sumField(prevSlice, 'followers_count')

      // Profile views: use period totals from the latest snapshot row
      const latest   = snapshots[0]
      const prior    = snapshots[range] ?? null
      const curViews  = range === 7 ? (latest?.profile_views_7d  ?? null) : (latest?.profile_views_30d  ?? null)
      const prevViews = range === 7 ? (prior?.profile_views_7d   ?? null) : (prior?.profile_views_30d   ?? null)

      if (curViews == null || curViews === 0) return { value: '—' }
      const curRate  = (curFollowers / curViews) * 100

      const prevRate = (prevViews != null && prevViews > 0)
        ? (prevFollowers / prevViews) * 100
        : null

      const value  = `${curRate.toFixed(1)}%`
      const change = prevRate !== null
        ? parseFloat((curRate - prevRate).toFixed(1))
        : undefined

      return { value, change }
    },
  },
] as const

// ── Grid ──────────────────────────────────────────────────────────────────────

export default function KpiGrid({ account, snapshots, loading = false }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
      {METRICS.map((metric) => (
        <KpiCard
          key={metric.title}
          title={metric.title}
          info={'info' in metric ? metric.info : undefined}
          icon={metric.icon}
          compute={metric.compute as KpiCardProps['compute']}
          account={account}
          snapshots={snapshots}
          loading={loading}
        />
      ))}
    </div>
  )
}
