'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users, Phone, Eye, DollarSign, TrendingUp, TrendingDown,
  Loader2, Globe, Monitor, Smartphone, Tablet, Minus,
} from 'lucide-react'
import type { VslMetricsResponse } from '@/app/api/metrics/vsl/route'
import type { FunnelMetricsResponse } from '@/app/api/metrics/funnel/route'

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

const DEVICE_COLORS = ['#2563eb', '#7c3aed', '#10b981']
const DEVICE_LABELS = ['Desktop', 'Mobile', 'Tablet']
const DEVICE_ICONS  = [Monitor, Smartphone, Tablet]

const TOOLTIP_STYLE = {
  background: '#0d1117',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
}

// Small lookup for common country names from ISO-2 codes
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', IN: 'India', BR: 'Brazil', MX: 'Mexico',
  PH: 'Philippines', NG: 'Nigeria', ZA: 'South Africa', ID: 'Indonesia',
  JP: 'Japan', KR: 'South Korea', SG: 'Singapore', AE: 'United Arab Emirates',
  NL: 'Netherlands', ES: 'Spain', IT: 'Italy', PK: 'Pakistan', BD: 'Bangladesh',
  MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', GH: 'Ghana', KE: 'Kenya',
  EG: 'Egypt', SA: 'Saudi Arabia', TR: 'Turkey', AR: 'Argentina', CO: 'Colombia',
  NZ: 'New Zealand', IE: 'Ireland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', PT: 'Portugal', CH: 'Switzerland', AT: 'Austria', BE: 'Belgium',
  PL: 'Poland', RU: 'Russia', UA: 'Ukraine', CL: 'Chile', PE: 'Peru',
  HK: 'Hong Kong', TW: 'Taiwan', IL: 'Israel', QA: 'Qatar', KW: 'Kuwait',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number) { return n.toLocaleString() }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function capitalize(s: string) {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '🌍'
  return Array.from(code.toUpperCase())
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join('')
}
function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
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
  return <div className={`rounded-xl bg-white/[0.02] animate-pulse`} style={{ height }} />
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
  const isUp    = delta !== null && delta >= 0
  const isDown  = delta !== null && delta < 0

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

// ── Vertical Funnel ────────────────────────────────────────────────────────

function truncate(s: string, max = 30): string {
  if (s.length <= max) return s
  // Break at last space before the limit
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut) + '…'
}

interface FunnelRowProps {
  title:       string
  count:       number
  maxCount:    number
  barColor:    string
  subValue?:   string
  icon:        React.ReactNode
  isLast?:     boolean
}

function FunnelRow({ title, count, maxCount, barColor, subValue, icon, isLast }: FunnelRowProps) {
  const pct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 4
  const displayTitle = truncate(title)
  const needsTooltip = title.length > 30

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] px-5 py-4">
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${barColor}18`, color: barColor }}
        >
          {icon}
        </div>

        {/* Name + bar */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline gap-3">
            <span
              className="text-[13px] font-medium text-white/80"
              title={needsTooltip ? title : undefined}
            >
              {displayTitle}
            </span>
            {subValue && (
              <span className="text-[11px] text-white/30">{subValue}</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        {/* Count */}
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
      {/* Vertical line */}
      <div className="flex w-8 flex-col items-center">
        <div className="h-5 w-px" style={{ backgroundColor: color, opacity: 0.4 }} />
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
          <path d="M6 0 L6 4 M3 2 L6 5 L9 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {pct !== null && (
        <span
          className="text-[11px] font-bold tabular-nums font-mono"
          style={{ color }}
        >
          {pct.toFixed(1)}% →
        </span>
      )}
    </div>
  )
}

function SkeletonFunnelRow() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] px-5 py-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-8 w-8 rounded-lg bg-white/[0.05]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 rounded bg-white/[0.05]" />
          <div className="h-2 w-full rounded-full bg-white/[0.04]" />
        </div>
        <div className="h-6 w-12 rounded bg-white/[0.05]" />
      </div>
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
  const [funnelName, setFunnelName] = useState<string>('')   // '' = all funnels
  const [funnelNames, setFunnelNames] = useState<string[]>([])
  const [vslData, setVslData]       = useState<VslMetricsResponse | null>(null)
  const [funnelData, setFunnelData] = useState<FunnelMetricsResponse | null>(null)
  const [loading, setLoading]       = useState(true)

  // Fetch distinct funnel names once on mount
  useEffect(() => {
    fetch('/api/metrics/funnel/names')
      .then(r => r.ok ? r.json() : { names: [] })
      .then((d: { names: string[] }) => setFunnelNames(d.names))
      .catch(() => {})
  }, [])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ range })
    if (range === 'custom' && customFrom) p.set('from', customFrom)
    if (range === 'custom' && customTo)   p.set('to', customTo)
    if (funnelName)                       p.set('funnel', funnelName)
    return p
  }, [range, customFrom, customTo, funnelName])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildParams()
      const [vslRes, funnelRes] = await Promise.all([
        fetch(`/api/metrics/vsl?${params}`),
        fetch(`/api/metrics/funnel?${params}`),
      ])
      if (vslRes.ok)    setVslData(await vslRes.json() as VslMetricsResponse)
      if (funnelRes.ok) setFunnelData(await funnelRes.json() as FunnelMetricsResponse)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived values ──────────────────────────────────────────────────────

  const crm        = vslData?.current
  const prev       = vslData?.previous
  const steps       = funnelData?.steps ?? []
  const pageNames   = funnelData?.page_names ?? []
  const dailyViews  = funnelData?.daily_views ?? []

  const totalVisitors     = funnelData?.total_visitors ?? 0
  const prevTotalVisitors = funnelData?.prev_total_visitors ?? 0

  // KPI deltas
  const visitorsDelta    = pctDelta(totalVisitors, prevTotalVisitors)
  const bookedDelta      = pctDelta(crm?.booked ?? 0, prev?.booked ?? 0)
  const showRateDelta    = prev && crm
    ? pctDelta(crm.show_rate, prev.show_rate)
    : null
  const closeRateDelta   = prev && crm
    ? pctDelta(crm.close_rate, prev.close_rate)
    : null

  // Apply → Book conversion
  const applyBook        = totalVisitors > 0 && crm
    ? (crm.booked / totalVisitors) * 100
    : 0
  const prevApplyBook    = prevTotalVisitors > 0 && prev
    ? (prev.booked / prevTotalVisitors) * 100
    : 0
  const applyBookDelta   = pctDelta(applyBook, prevApplyBook)

  // CRM step definitions
  const lastPageUnique = steps.length > 0 ? steps[steps.length - 1].unique_views : 0
  const pageToBookedPct =
    lastPageUnique > 0 && crm && crm.booked > 0
      ? Math.round((crm.booked / lastPageUnique) * 1000) / 10
      : null

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

  // Daily booked chart (built from leads array in VSL response)
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

  // Device breakdown
  const deviceBreakdown = funnelData?.overall_device_breakdown ?? { desktop: 0, mobile: 0, tablet: 0 }
  const deviceTotal = deviceBreakdown.desktop + deviceBreakdown.mobile + deviceBreakdown.tablet
  const deviceChartData = [
    { name: 'Desktop', value: deviceBreakdown.desktop },
    { name: 'Mobile',  value: deviceBreakdown.mobile },
    { name: 'Tablet',  value: deviceBreakdown.tablet },
  ]

  // Traffic sources
  const referrers = funnelData?.overall_referrers ?? []
  const referrerTotal = referrers.reduce((s, r) => s + r.count, 0)

  // Countries
  const countries = funnelData?.country_breakdown ?? []
  const countryTotal = countries.reduce((s, c) => s + c.count, 0)

  const hasData = !loading && (totalVisitors > 0 || (crm?.booked ?? 0) > 0)

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

        {/* Funnel selector — only shown once we have more than one named funnel */}
        {funnelNames.length > 0 && (
          <select
            value={funnelName}
            onChange={e => setFunnelName(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-white/20"
          >
            <option value="">All funnels</option>
            {funnelNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
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
              delta={visitorsDelta}
              icon={<Users size={13} />}
            />
            <KpiCard
              label="Apply → Book"
              value={fmtPct(applyBook)}
              delta={applyBookDelta}
              icon={<TrendingUp size={13} />}
              noTrend={prevTotalVisitors === 0}
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

      {/* ── Section 2: Visual Funnel ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
        <SectionHeader icon={<TrendingUp size={13} />} label="Conversion Funnel" />

        {(() => {
          // Build the full ordered list of rows for the vertical funnel
          const pageStepColors = ['#2563eb', '#3b6fd4', '#4e7abf', '#5f83aa', '#6e8c96']
          const maxCount = steps.length > 0 ? steps[0].unique_views : (crm?.booked ?? 0)

          if (loading) {
            return (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonFunnelRow key={i} />)}
              </div>
            )
          }

          if (steps.length === 0 && (crm?.booked ?? 0) === 0) {
            return (
              <div className="flex h-32 items-center justify-center text-white/20 text-sm">
                No funnel data for this period
              </div>
            )
          }

          return (
            <div className="space-y-0">
              {steps.map((step, i) => (
                <div key={step.page_name}>
                  <FunnelRow
                    title={capitalize(step.page_name)}
                    count={step.unique_views}
                    maxCount={maxCount}
                    barColor={pageStepColors[Math.min(i, pageStepColors.length - 1)]}
                    subValue={`${fmtNum(step.all_views)} total views`}
                    icon={<Eye size={13} />}
                  />
                  <FunnelConnector
                    pct={i < steps.length - 1 ? step.conversion_to_next : pageToBookedPct}
                  />
                </div>
              ))}

              {crmSteps.map((step, i) => (
                <div key={step.key}>
                  <FunnelRow
                    title={step.title}
                    count={step.count}
                    maxCount={maxCount}
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
          )
        })()}
      </div>

      {/* ── Section 3: Daily Trends ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Page Views Area Chart */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
          <SectionHeader icon={<Eye size={13} />} label="Page Views by Day" />

          {loading ? (
            <SkeletonChart />
          ) : dailyViews.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-white/20 text-sm">
              No data for this period
            </div>
          ) : (() => {
            const chartData = dailyViews.map(pt => ({
              date: pt.date as string,
              views: pageNames.reduce(
                (s, n) => s + (typeof pt[n] === 'number' ? (pt[n] as number) : 0),
                0
              ),
            }))
            return (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={d => fmtDate(d as string)}
                    formatter={(v: unknown) => [fmtNum(Number(v)), 'Views']}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#pgGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )
          })()}
        </div>

        {/* Booked Calls Bar Chart */}
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
      </div>

      {/* ── Section 4: Traffic Sources + Device Breakdown ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Traffic Sources */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
          <SectionHeader icon={<Globe size={13} />} label="Traffic Sources" />

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex justify-between mb-1.5">
                    <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
                    <div className="h-2.5 w-10 rounded bg-white/[0.04]" />
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.04]" style={{ width: `${80 - i * 12}%` }} />
                </div>
              ))}
            </div>
          ) : referrers.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-white/20 text-sm">
              No referrer data yet
            </div>
          ) : (
            <div className="space-y-3.5">
              {referrers.map(r => {
                const pct = referrerTotal > 0 ? (r.count / referrerTotal) * 100 : 0
                return (
                  <div key={r.source}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[12px] font-medium text-white/70">
                        {capitalize(r.source)}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-mono text-white/40">
                          {fmtNum(r.count)}
                        </span>
                        <span className="text-[11px] font-semibold text-white/50 tabular-nums w-10 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
          <SectionHeader icon={<Monitor size={13} />} label="Device Breakdown" />

          {loading ? (
            <SkeletonChart height={160} />
          ) : deviceTotal === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-white/20 text-sm">
              No device data yet
            </div>
          ) : (
            <>
              <div className="relative h-[160px]">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={deviceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      {deviceChartData.map((_, i) => (
                        <Cell key={i} fill={DEVICE_COLORS[i]} />
                      ))}
                    </Pie>
                    <RTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: unknown) => [fmtNum(Number(v)), '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="font-mono text-lg font-bold text-white tabular-nums leading-none">
                      {fmtNum(deviceTotal)}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-white/30 mt-0.5">
                      sessions
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-5 mt-2">
                {deviceChartData.map((d, i) => {
                  const pct = deviceTotal > 0 ? ((d.value / deviceTotal) * 100).toFixed(1) : '0.0'
                  const Icon = DEVICE_ICONS[i]
                  return (
                    <div key={d.name} className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DEVICE_COLORS[i] }} />
                        <Icon size={11} className="text-white/40" />
                        <span className="text-[11px] text-white/50">{DEVICE_LABELS[i]}</span>
                      </div>
                      <span className="font-mono text-[13px] font-semibold text-white/70">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section 5: Top Countries ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-6">
        <SectionHeader icon={<Globe size={13} />} label="Top Countries" />

        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-white/[0.04] animate-pulse">
                <div className="w-6 h-4 rounded bg-white/[0.06]" />
                <div className="h-2.5 w-28 rounded bg-white/[0.06] flex-1" />
                <div className="h-2.5 w-12 rounded bg-white/[0.04]" />
                <div className="h-2.5 w-10 rounded bg-white/[0.04]" />
              </div>
            ))}
          </div>
        ) : countries.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-white/20 text-sm">
            No country data yet — IP lookup activates on new pageviews
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-4 pb-2 mb-1 border-b border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-widest text-white/25 w-6 text-center">#</span>
              <span className="text-[10px] uppercase tracking-widest text-white/25 flex-1">Country</span>
              <span className="text-[10px] uppercase tracking-widest text-white/25 w-16 text-right">Visitors</span>
              <span className="text-[10px] uppercase tracking-widest text-white/25 w-12 text-right">Share</span>
            </div>
            {countries.map((c, i) => {
              const pct = countryTotal > 0 ? ((c.count / countryTotal) * 100).toFixed(1) : '0.0'
              return (
                <div
                  key={c.country}
                  className="flex items-center gap-4 py-2.5 border-b border-white/[0.04] last:border-0 group"
                >
                  <span className="text-[11px] text-white/20 w-6 text-center tabular-nums font-mono">
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-base leading-none select-none">{countryFlag(c.country)}</span>
                    <span className="text-[13px] text-white/70 truncate">{countryName(c.country)}</span>
                  </div>
                  <span className="font-mono text-[13px] font-semibold text-white/60 tabular-nums w-16 text-right">
                    {fmtNum(c.count)}
                  </span>
                  <div className="w-12 flex items-center justify-end gap-1.5">
                    <span className="font-mono text-[11px] text-white/35 tabular-nums">{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Empty state for entire dashboard */}
      {!loading && !hasData && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-12 text-center">
          <TrendingUp className="w-8 h-8 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No data for this period</p>
          <p className="text-white/15 text-xs mt-1">Add the tracking script to your funnel pages to start collecting data</p>
        </div>
      )}

    </div>
  )
}
