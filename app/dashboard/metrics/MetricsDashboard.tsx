'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users, Phone, Eye, DollarSign, TrendingUp, TrendingDown,
  Loader2, Minus,
} from 'lucide-react'
import type { VslMetricsResponse } from '@/app/api/metrics/vsl/route'

// ── Constants ──────────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

const TOOLTIP_STYLE = {
  background: '#0d1117',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number) { return n.toLocaleString() }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function pctDelta(current: number, prev: number): number | null {
  if (prev === 0) return null
  return ((current - prev) / prev) * 100
}

// ── Skeleton components ────────────────────────────────────────────────────

function SkeletonKpi() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117] p-5 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
        <div className="w-7 h-7 rounded-lg bg-white/[0.04]" />
      </div>
      <div className="h-8 w-28 rounded bg-white/[0.06] mb-3" />
      <div className="h-2.5 w-16 rounded bg-white/[0.04]" />
    </div>
  )
}

function SkeletonChart({ height = 180 }: { height?: number }) {
  return <div className="rounded-xl bg-white/[0.02] animate-pulse" style={{ height }} />
}

// ── KPI Card ───────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  delta: number | null
  icon: React.ReactNode
  accent?: string
  noTrend?: boolean
}

function KpiCard({ label, value, delta, icon, accent = '#2563eb', noTrend }: KpiCardProps) {
  const isUp   = delta !== null && delta >= 0
  const isDown = delta !== null && delta < 0

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117] p-5 flex flex-col min-w-0">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-medium uppercase tracking-widest text-white/40 leading-tight pr-2">
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
      </div>

      <div className="font-mono text-[28px] font-bold text-white tabular-nums leading-none mb-2.5">
        {value}
      </div>

      {noTrend ? (
        <div className="text-[10px] text-white/20 flex items-center gap-1">
          <Minus size={10} />
          no comparison
        </div>
      ) : delta === null ? (
        <div className="text-[10px] text-white/20">no prev data</div>
      ) : (
        <div className="flex items-center gap-1.5">
          {isUp
            ? <TrendingUp size={11} className="text-[#10b981] shrink-0" />
            : isDown
            ? <TrendingDown size={11} className="text-[#f87171] shrink-0" />
            : <Minus size={11} className="text-white/30 shrink-0" />
          }
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: isUp ? '#10b981' : isDown ? '#f87171' : 'rgba(255,255,255,0.3)' }}
          >
            {isUp ? '+' : ''}{delta.toFixed(1)}%
          </span>
          <span className="text-[10px] text-white/20">vs prev period</span>
        </div>
      )}
    </div>
  )
}

// ── Funnel Row (CRM) ───────────────────────────────────────────────────────

interface FunnelRowProps {
  title:      string
  count:      number
  maxCount:   number
  barColor:   string
  subValue?:  string
  icon:       React.ReactNode
  isLast?:    boolean
}

function FunnelRow({ title, count, maxCount, barColor, subValue, icon, isLast }: FunnelRowProps) {
  const pct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 4

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] px-5 py-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${barColor}18`, color: barColor }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-[13px] font-medium text-white/80">{title}</span>
            {subValue && <span className="text-[11px] text-white/30">{subValue}</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span
            className="font-mono text-[22px] font-bold tabular-nums leading-none"
            style={{ color: isLast ? barColor : '#f9fafb' }}
          >
            {count.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}

function FunnelConnector({ pct }: { pct: number | null }) {
  const color =
    pct === null  ? 'rgba(255,255,255,0.12)'
    : pct >= 50   ? '#10b981'
    : pct >= 20   ? '#f59e0b'
    :               '#f87171'

  return (
    <div className="flex items-center gap-3 py-0.5 pl-[52px]">
      <div className="flex w-8 flex-col items-center">
        <div className="h-5 w-px" style={{ backgroundColor: color, opacity: 0.4 }} />
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
          <path d="M6 0 L6 4 M3 2 L6 5 L9 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {pct !== null && (
        <span className="text-[11px] font-bold tabular-nums font-mono" style={{ color }}>
          {pct.toFixed(1)}% →
        </span>
      )}
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <div className="text-white/35">{icon}</div>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
        {label}
      </span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const [range, setRange]           = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [vslData, setVslData]       = useState<VslMetricsResponse | null>(null)
  const [totalVisitors, setTotalVisitors]       = useState(0)
  const [totalSubmissions, setTotalSubmissions] = useState(0)
  const [loading, setLoading]       = useState(true)

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ range })
    if (range === 'custom' && customFrom) p.set('from', customFrom)
    if (range === 'custom' && customTo)   p.set('to', customTo)
    return p
  }, [range, customFrom, customTo])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildParams()
      const [vslRes, statsRes, formsRes] = await Promise.all([
        fetch(`/api/metrics/vsl?${params}`),
        fetch(`/api/integrations/ghl/funnel-stats?${params}`),
        fetch(`/api/integrations/ghl/form-submissions?${params}`),
      ])
      if (vslRes.ok)   setVslData(await vslRes.json() as VslMetricsResponse)
      if (statsRes.ok) setTotalVisitors(((await statsRes.json()) as { totalVisitors: number }).totalVisitors)
      if (formsRes.ok) setTotalSubmissions(((await formsRes.json()) as { totalSubmissions: number }).totalSubmissions)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived values ──────────────────────────────────────────────────────

  const crm  = vslData?.current
  const prev = vslData?.previous

  // KPI deltas (CRM-sourced)
  const bookedDelta    = pctDelta(crm?.booked ?? 0, prev?.booked ?? 0)
  const showRateDelta  = prev && crm ? pctDelta(crm.show_rate,  prev.show_rate)  : null
  const closeRateDelta = prev && crm ? pctDelta(crm.close_rate, prev.close_rate) : null

  // Apply → Book: form submissions ÷ total visitors
  const applyBook = totalVisitors > 0
    ? (totalSubmissions / totalVisitors) * 100
    : 0

  // CRM step definitions
  const crmSteps = [
    {
      key: 'call_booked', title: 'Call Booked', icon: <Phone size={12} />,
      count: crm?.booked ?? 0, accentColor: '#8b5cf6',
      subLabel: `Show rate: ${crm ? fmtPct(crm.show_rate) : '—'}`,
      convNext: crm && crm.booked > 0
        ? Math.round((crm.showed / crm.booked) * 1000) / 10
        : null,
    },
    {
      key: 'showed', title: 'Showed', icon: <Users size={12} />,
      count: crm?.showed ?? 0, accentColor: '#f59e0b',
      subLabel: `Close rate: ${crm ? fmtPct(crm.close_rate) : '—'}`,
      convNext: crm && crm.showed > 0
        ? Math.round((crm.closed_won / crm.showed) * 1000) / 10
        : null,
    },
    {
      key: 'closed_won', title: 'Closed Won', icon: <DollarSign size={12} />,
      count: crm?.closed_won ?? 0, accentColor: '#10b981',
      subLabel: crm ? `Revenue: ${fmt$(crm.revenue)}` : 'Revenue: —',
      convNext: null as number | null,
    },
  ]

  // Daily booked chart
  const dailyBooked = (() => {
    const leads = vslData?.leads ?? []
    const map: Record<string, number> = {}
    for (const l of leads) {
      const d = l.created_at.slice(0, 10)
      map[d] = (map[d] ?? 0) + 1
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))
  })()

  const hasData = !loading && ((crm?.booked ?? 0) > 0 || totalVisitors > 0)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Range selector ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                range === r.value
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-white/20"
            />
            <span className="text-white/30 text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-white/20"
            />
          </div>
        )}

        {loading && <Loader2 size={13} className="animate-spin text-white/30" />}
      </div>

      {/* ── Section 1: KPI Bar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)
        ) : (
          <>
            <KpiCard
              label="Total Visitors"
              value={fmtNum(totalVisitors)}
              delta={null}
              icon={<Users size={13} />}
              noTrend
            />
            <KpiCard
              label="Apply → Book"
              value={fmtPct(applyBook)}
              delta={null}
              icon={<TrendingUp size={13} />}
              noTrend
            />
            <KpiCard
              label="Total Booked Calls"
              value={fmtNum(crm?.booked ?? 0)}
              delta={bookedDelta}
              icon={<Phone size={13} />}
              accent="#8b5cf6"
            />
            <KpiCard
              label="Show Rate"
              value={fmtPct(crm?.show_rate ?? 0)}
              delta={showRateDelta}
              icon={<Eye size={13} />}
              accent="#f59e0b"
            />
            <KpiCard
              label="Close Rate"
              value={fmtPct(crm?.close_rate ?? 0)}
              delta={closeRateDelta}
              icon={<DollarSign size={13} />}
              accent="#10b981"
            />
          </>
        )}
      </div>

      {/* ── CRM Funnel ───────────────────────────────────────────────────── */}
      {!loading && crm && (crm.booked > 0 || crm.showed > 0 || crm.closed_won > 0) && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
          <SectionHeader icon={<Phone size={13} />} label="CRM Funnel" />
          <div className="space-y-0">
            {crmSteps.map((step, i) => (
              <div key={step.key}>
                <FunnelRow
                  title={step.title}
                  count={step.count}
                  maxCount={crm.booked}
                  barColor={step.accentColor}
                  subValue={step.subLabel}
                  icon={step.icon}
                  isLast={i === crmSteps.length - 1}
                />
                {i < crmSteps.length - 1 && (
                  <FunnelConnector pct={step.convNext} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Booked Calls by Day ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
        <SectionHeader icon={<Phone size={13} />} label="Booked Calls by Day" />

        {loading ? (
          <SkeletonChart />
        ) : dailyBooked.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-white/20 text-sm">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={dailyBooked}
              margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              barCategoryGap="40%"
            >
              <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.05} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'var(--font-sans)' }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtDate}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'var(--font-sans)' }}
                axisLine={false} tickLine={false} allowDecimals={false}
              />
              <RTooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={d => fmtDate(d as string)}
                formatter={(v: unknown) => [fmtNum(Number(v)), 'Booked']}
              />
              <Bar
                dataKey="count"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Empty state */}
      {!loading && !hasData && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-12 text-center">
          <TrendingUp className="w-8 h-8 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No data for this period</p>
        </div>
      )}

    </div>
  )
}
