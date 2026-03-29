'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Eye, Phone, Users, DollarSign, TrendingUp, Loader2 } from 'lucide-react'
import type { VslMetricsResponse } from '@/app/api/metrics/vsl/route'
import type { FunnelMetricsResponse } from '@/app/api/metrics/funnel/route'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number) { return n.toLocaleString() }
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function capitalize(s: string) {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Types ──────────────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'
const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

const LINE_COLORS = ['#3b82f6', '#6366f1', '#06b6d4', '#0ea5e9', '#8b5cf6', '#ec4899']

// ── Sub-components ─────────────────────────────────────────────────────────

function SkeletonCard({ width }: { width: number }) {
  return (
    <div
      className="rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse flex-shrink-0"
      style={{ width, minWidth: width, height: 164 }}
    />
  )
}

interface FunnelCardProps {
  icon: React.ReactNode
  title: string
  mainValue: string
  stats: { label: string; value: string }[]
  accentColor: string
  accentBg: string
  width: number
}

function FunnelCard({ icon, title, mainValue, stats, accentColor, accentBg, width }: FunnelCardProps) {
  return (
    <div
      className="rounded-2xl border border-white/[0.08] bg-[#0c0c0e] flex flex-col flex-shrink-0"
      style={{ width, minWidth: width, height: 164, borderTopColor: accentColor, borderTopWidth: 2 }}
    >
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/35 leading-none pt-0.5 pr-2 line-clamp-2">
            {title}
          </span>
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${accentBg}`}
            style={{ color: accentColor }}
          >
            {icon}
          </div>
        </div>

        <div className="text-3xl font-bold text-white tabular-nums leading-none">
          {mainValue}
        </div>

        <div className="mt-auto pt-2.5 border-t border-white/[0.05] space-y-1">
          {stats.map(s => (
            <div key={s.label} className="flex justify-between items-center gap-2">
              <span className="text-[10px] text-white/30 truncate">{s.label}</span>
              <span className="text-[11px] font-semibold text-white/55 tabular-nums shrink-0">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FunnelArrow({ pct }: { pct: number | null }) {
  const color =
    pct === null ? 'rgba(255,255,255,0.15)'
    : pct >= 50  ? '#10b981'
    : pct >= 20  ? '#f59e0b'
    :              '#f87171'

  return (
    <div className="flex flex-col items-center justify-center gap-1 shrink-0 w-10">
      {pct !== null && (
        <span className="text-[10px] font-bold tabular-nums leading-none" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
      )}
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
        <path
          d="M0 5 H14 M10 1.5 L14 5 L10 8.5"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const [range, setRange]           = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [vslData, setVslData]       = useState<VslMetricsResponse | null>(null)
  const [funnelData, setFunnelData] = useState<FunnelMetricsResponse | null>(null)
  const [loading, setLoading]       = useState(true)
  const [hiddenPages, setHiddenPages] = useState<Set<string>>(new Set())

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

  // Reset hidden pages on new funnel data
  useEffect(() => { setHiddenPages(new Set()) }, [funnelData?.page_names?.join(',')])

  const crm        = vslData?.current
  const steps      = funnelData?.steps ?? []
  const pageNames  = funnelData?.page_names ?? []
  const dailyViews = funnelData?.daily_views ?? []

  // Card widths: narrow linearly from MAX_W to MIN_W across all steps
  const totalCards = steps.length + 3 // + 3 CRM steps
  const MAX_W = 190
  const MIN_W = 120
  const stepDelta = totalCards > 1 ? (MAX_W - MIN_W) / (totalCards - 1) : 0
  function cardWidth(idx: number) {
    return Math.max(MIN_W, Math.round(MAX_W - idx * stepDelta))
  }

  // CRM step definitions
  const lastPageUnique = steps.length > 0 ? steps[steps.length - 1].unique_views : 0
  const pageToBookedPct =
    lastPageUnique > 0 && crm && crm.booked > 0
      ? Math.round((crm.booked / lastPageUnique) * 1000) / 10
      : null

  const crmSteps = [
    {
      key: 'call_booked',
      title: 'Call Booked',
      icon: <Phone size={13} />,
      count: crm?.booked ?? 0,
      stats: [{ label: 'Show rate', value: crm ? `${crm.show_rate.toFixed(1)}%` : '0%' }],
      accentColor: '#8b5cf6',
      accentBg: 'bg-violet-500/10',
      convNext: crm && crm.booked > 0
        ? Math.round((crm.showed / crm.booked) * 1000) / 10
        : null,
    },
    {
      key: 'showed',
      title: 'Showed',
      icon: <Users size={13} />,
      count: crm?.showed ?? 0,
      stats: [{ label: 'Close rate', value: crm ? `${crm.close_rate.toFixed(1)}%` : '0%' }],
      accentColor: '#f59e0b',
      accentBg: 'bg-amber-500/10',
      convNext: crm && crm.showed > 0
        ? Math.round((crm.closed_won / crm.showed) * 1000) / 10
        : null,
    },
    {
      key: 'closed_won',
      title: 'Closed Won',
      icon: <DollarSign size={13} />,
      count: crm?.closed_won ?? 0,
      stats: [
        { label: 'Revenue',  value: crm ? fmt$(crm.revenue) : '$0' },
        { label: 'Avg deal', value: crm ? fmt$(crm.avg_deal) : '$0' },
      ],
      accentColor: '#10b981',
      accentBg: 'bg-emerald-500/10',
      convNext: null as number | null,
    },
  ]

  return (
    <div className="space-y-6">

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

      {/* ── Funnel visualization ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={13} className="text-white/35" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
            Conversion Funnel
          </span>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex items-center gap-0 min-w-max">

            {loading ? (
              // Skeleton
              [0, 1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center">
                  <SkeletonCard width={cardWidth(i)} />
                  {i < 4 && (
                    <div className="w-10 flex items-center justify-center">
                      <div className="h-px w-5 bg-white/10 animate-pulse" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                {/* Page funnel steps */}
                {steps.map((step, i) => (
                  <div key={step.page_name} className="flex items-center">
                    <FunnelCard
                      width={cardWidth(i)}
                      icon={<Eye size={13} />}
                      title={capitalize(step.page_name)}
                      mainValue={fmtNum(step.unique_views)}
                      stats={[{ label: 'Total views', value: fmtNum(step.all_views) }]}
                      accentColor="#3b82f6"
                      accentBg="bg-blue-500/10"
                    />
                    <FunnelArrow
                      pct={i < steps.length - 1 ? step.conversion_to_next : pageToBookedPct}
                    />
                  </div>
                ))}

                {/* CRM steps */}
                {crmSteps.map((step, i) => (
                  <div key={step.key} className="flex items-center">
                    <FunnelCard
                      width={cardWidth(steps.length + i)}
                      icon={step.icon}
                      title={step.title}
                      mainValue={fmtNum(step.count)}
                      stats={step.stats}
                      accentColor={step.accentColor}
                      accentBg={step.accentBg}
                    />
                    {i < crmSteps.length - 1 && <FunnelArrow pct={step.convNext} />}
                  </div>
                ))}
              </>
            )}

          </div>
        </div>
      </div>

      {/* ── Daily views chart ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2">
            <Eye size={13} className="text-white/35" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Daily Page Views
            </span>
          </div>

          {/* Page toggles */}
          {pageNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pageNames.map((name, i) => {
                const color  = LINE_COLORS[i % LINE_COLORS.length]
                const hidden = hiddenPages.has(name)
                return (
                  <button
                    key={name}
                    onClick={() =>
                      setHiddenPages(prev => {
                        const next = new Set(prev)
                        if (next.has(name)) next.delete(name)
                        else next.add(name)
                        return next
                      })
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
                    style={
                      hidden
                        ? { borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }
                        : { borderColor: `${color}50`, color, background: `${color}10` }
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: hidden ? 'rgba(255,255,255,0.12)' : color }}
                    />
                    {capitalize(name)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-56 rounded-xl bg-white/[0.02] animate-pulse" />
        ) : dailyViews.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-white/20 text-sm">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <LineChart data={dailyViews} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={d => {
                  const dt = new Date(d + 'T00:00:00')
                  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <RTooltip
                contentStyle={{
                  background: '#111113',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.7)',
                }}
                labelFormatter={d => {
                  const dt = new Date(d + 'T00:00:00')
                  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                }}
              />
              {pageNames
                .filter(name => !hiddenPages.has(name))
                .map(name => {
                  const originalIdx = pageNames.indexOf(name)
                  return (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      name={capitalize(name)}
                      stroke={LINE_COLORS[originalIdx % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  )
                })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  )
}
