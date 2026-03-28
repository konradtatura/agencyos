'use client'

import { useState } from 'react'
import StatCard from '@/components/ui/stat-card'
import { Users, Eye, BarChart2, Heart, Info } from 'lucide-react'

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
  compute: (snapshots: Snapshot[], range: Range, account: IgAccount) => { value: string; change?: number }
  icon:    React.ComponentType<{ className?: string }>
  account: IgAccount
  snapshots: Snapshot[]
  loading?: boolean
}

function KpiCard({ title, info, compute, icon, account, snapshots, loading }: KpiCardProps) {
  const [range, setRange] = useState<Range>(7)

  const previous = snapshots.slice(range, range * 2)

  const { value, change } = compute(
    // pass both windows via a combined array; compute receives full snapshots
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
      s.accounts_engaged_7d ?? s.accounts_engaged_30d
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
      return {
        value:  fmtNum(account.followers_count),
        change: pctChange(curDelta, prevDelta),
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
] as const

// ── Grid ──────────────────────────────────────────────────────────────────────

export default function KpiGrid({ account, snapshots, loading = false }: Props) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
