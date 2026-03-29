'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Cell, LabelList,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, Phone, Eye, CheckCircle2,
  PhoneMissed, DollarSign, Target, X, ChevronRight, ExternalLink,
  Loader2, ArrowDown,
} from 'lucide-react'
import type { VslMetricsResponse, LeadSummary, CloserStats, PeriodStats } from '@/app/api/metrics/vsl/route'
import type { FunnelMetricsResponse, FunnelStep } from '@/app/api/metrics/funnel/route'

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function fmtNum(n: number) { return n.toLocaleString() }

function delta(cur: number, prev: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0) return { pct: 0, dir: 'flat' }
  const pct = ((cur - prev) / prev) * 100
  return { pct: Math.abs(pct), dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Range selector ─────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'
const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d',    label: '7 days' },
  { value: '30d',   label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all',   label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

// ── Stage labels ───────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, { label: string; color: string }> = {
  call_booked:  { label: 'Booked',      color: '#60a5fa' },
  showed:       { label: 'Showed',      color: '#a78bfa' },
  closed_won:   { label: 'Closed Won',  color: '#34d399' },
  closed_lost:  { label: 'Closed Lost', color: '#f87171' },
  no_show:      { label: 'No Show',     color: '#fbbf24' },
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const [range, setRange]           = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [data, setData]               = useState<VslMetricsResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [funnelData, setFunnelData]   = useState<FunnelMetricsResponse | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(true)
  const [adSpend, setAdSpend]         = useState<string>('')
  const [panel, setPanel]             = useState<{ title: string; leads: LeadSummary[] } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range })
      if (range === 'custom' && customFrom) params.set('from', customFrom)
      if (range === 'custom' && customTo)   params.set('to', customTo)
      const res = await fetch(`/api/metrics/vsl?${params}`)
      if (res.ok) {
        const json = await res.json() as VslMetricsResponse
        setData(json)
        // Pre-fill ad spend input from DB if not already set
        if (json.ad_spend && !adSpend) setAdSpend(String(json.ad_spend))
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo])

  const fetchFunnel = useCallback(async () => {
    setFunnelLoading(true)
    try {
      const params = new URLSearchParams({ range })
      if (range === 'custom' && customFrom) params.set('from', customFrom)
      if (range === 'custom' && customTo)   params.set('to', customTo)
      const res = await fetch(`/api/metrics/funnel?${params}`)
      if (res.ok) setFunnelData(await res.json() as FunnelMetricsResponse)
    } finally {
      setFunnelLoading(false)
    }
  }, [range, customFrom, customTo])

  useEffect(() => {
    if (range !== 'custom' || (customFrom && customTo)) {
      fetchData()
      fetchFunnel()
    }
  }, [fetchData, fetchFunnel, range, customFrom, customTo])

  const adSpendNum = parseFloat(adSpend) || null
  const cpbc = adSpendNum && data ? adSpendNum / Math.max(data.current.booked, 1) : null
  const cpa  = adSpendNum && data ? adSpendNum / Math.max(data.current.closed_won, 1) : null
  const prevCpbc = adSpendNum && data ? adSpendNum / Math.max(data.previous.booked, 1) : null
  const prevCpa  = adSpendNum && data ? adSpendNum / Math.max(data.previous.closed_won, 1) : null

  // ── Lead filters for drill-down ──────────────────────────────────────────
  function openPanel(title: string, filter: (l: LeadSummary) => boolean) {
    if (!data) return
    setPanel({ title, leads: data.leads.filter(filter) })
  }

  return (
    <div className="space-y-8 pb-12">

      {/* ── Range selector ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              range === r.value
                ? 'bg-[#2563eb] text-white'
                : 'bg-white/5 text-[#9ca3af] hover:bg-white/10 hover:text-[#f9fafb]'
            }`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-[#f9fafb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
            <span className="text-[#4b5563] text-xs">→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-[#f9fafb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
          </div>
        )}
        {loading && <Loader2 className="w-4 h-4 text-[#4b5563] animate-spin ml-1" />}
        {data && (
          <span className="ml-auto text-xs text-[#4b5563]">{data.period.label}</span>
        )}
      </div>

      {/* ── Section 0: Page-view funnel ─────────────────────────────────── */}
      <PageViewFunnel steps={funnelData?.steps ?? null} loading={funnelLoading} />

      {/* ── Section 1: Metric cards ──────────────────────────────────────── */}
      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<Phone className="w-4 h-4" />}
            label="Booked Calls"
            value={fmtNum(data.current.booked)}
            delta={delta(data.current.booked, data.previous.booked)}
            onClick={() => openPanel('All Booked Calls', () => true)}
          />
          <MetricCard
            icon={<Eye className="w-4 h-4" />}
            label="Show Rate"
            value={fmtPct(data.current.show_rate)}
            delta={delta(data.current.show_rate, data.previous.show_rate)}
            onClick={() => openPanel('Showed Up', l => l.stage === 'closed_won' || l.stage === 'closed_lost')}
          />
          <MetricCard
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Close Rate"
            value={fmtPct(data.current.close_rate)}
            delta={delta(data.current.close_rate, data.previous.close_rate)}
            onClick={() => openPanel('Closed Won', l => l.stage === 'closed_won')}
            accent="emerald"
          />
          <MetricCard
            icon={<PhoneMissed className="w-4 h-4" />}
            label="No-Show Rate"
            value={fmtPct(data.current.no_show_rate)}
            delta={delta(data.current.no_show_rate, data.previous.no_show_rate)}
            invertDelta
            onClick={() => openPanel('No Shows', l => l.stage === 'no_show')}
            accent="red"
          />
          <MetricCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Revenue Closed"
            value={fmt$(data.current.revenue)}
            delta={delta(data.current.revenue, data.previous.revenue)}
            onClick={() => openPanel('Closed Won — Revenue', l => l.stage === 'closed_won')}
            accent="emerald"
          />
          <MetricCard
            icon={<Target className="w-4 h-4" />}
            label="Avg Deal Value"
            value={fmt$(data.current.avg_deal)}
            delta={delta(data.current.avg_deal, data.previous.avg_deal)}
            onClick={() => openPanel('Closed Won — Revenue', l => l.stage === 'closed_won')}
            accent="emerald"
          />
          {/* Cost per booked call */}
          <AdSpendCard
            label="Cost per Booked Call"
            value={cpbc ? fmt$(cpbc) : null}
            prevValue={prevCpbc ? fmt$(prevCpbc) : null}
            adSpend={adSpend}
            onAdSpendChange={setAdSpend}
            hint="ad spend ÷ booked calls"
          />
          {/* CPA */}
          <AdSpendCard
            label="Cost per Acquisition"
            value={cpa ? fmt$(cpa) : null}
            prevValue={prevCpa ? fmt$(prevCpa) : null}
            adSpend={adSpend}
            onAdSpendChange={setAdSpend}
            hint="ad spend ÷ closed won"
            hideInput
          />
        </div>
      ) : null}

      {/* ── Section 2: Funnel ───────────────────────────────────────────── */}
      {data && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0d1117] p-5">
          <h2 className="text-sm font-semibold text-[#f9fafb] mb-1">Funnel</h2>
          <p className="text-xs text-[#4b5563] mb-6">
            {data.period.from !== data.period.prev_from
              ? `${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`
              : 'All time'}
          </p>
          <FunnelChart current={data.current} onStageClick={(stage, leads) => openPanel(stage, leads)} data={data} />
        </div>
      )}

      {/* ── Section 3: Per-closer table ──────────────────────────────────── */}
      {data && data.per_closer.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0d1117] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-[#f9fafb]">Per Closer</h2>
          </div>
          <CloserTable
            closers={data.per_closer}
            leads={data.leads}
            onOpenPanel={openPanel}
          />
        </div>
      )}

      {data && data.per_closer.length === 0 && !loading && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0d1117] p-10 text-center">
          <p className="text-sm text-[#4b5563]">No closer data for this period.</p>
        </div>
      )}

      {/* ── Slide panel ──────────────────────────────────────────────────── */}
      <LeadsPanel panel={panel} onClose={() => setPanel(null)} />
    </div>
  )
}

// ── Page-view funnel ───────────────────────────────────────────────────────

function PageViewFunnel({ steps, loading }: { steps: FunnelStep[] | null; loading: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d1117] p-5">
      <h2 className="text-sm font-semibold text-[#f9fafb] mb-1">Page Funnel</h2>
      <p className="text-xs text-[#4b5563] mb-5">Unique visitors by funnel step</p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : !steps || steps.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-[#4b5563]">No page view data for this period.</p>
        </div>
      ) : (
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={step.page_name}>
              {/* Step row */}
              <div className="flex items-center gap-4 py-3 border-b border-white/[0.06] last:border-b-0">
                {/* Page name */}
                <div className="w-36 shrink-0">
                  <span className="text-sm font-medium text-[#f9fafb] capitalize">{step.page_name}</span>
                </div>
                {/* All views */}
                <div className="flex-1 text-center">
                  <div className="text-lg font-bold font-mono text-[#f9fafb]">{step.all_views.toLocaleString()}</div>
                  <div className="text-[10px] text-[#4b5563] uppercase tracking-wide">All views</div>
                </div>
                {/* Unique views */}
                <div className="flex-1 text-center">
                  <div className="text-lg font-bold font-mono text-[#60a5fa]">{step.unique_views.toLocaleString()}</div>
                  <div className="text-[10px] text-[#4b5563] uppercase tracking-wide">Unique</div>
                </div>
              </div>
              {/* Conversion arrow between steps */}
              {step.conversion_to_next !== null && (
                <div className="flex items-center gap-2 py-1.5 pl-36">
                  <ArrowDown className="w-3 h-3 text-[#4b5563] shrink-0" />
                  <span className="text-xs font-medium text-[#6366f1]">
                    {step.conversion_to_next.toFixed(1)}% conversion
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Divider below funnel, above call metrics */}
      <div className="mt-5 pt-4 border-t border-white/[0.06]">
        <p className="text-xs text-[#4b5563]">Call booked → Showed → Closed metrics below</p>
      </div>
    </div>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, delta: d, onClick, invertDelta = false, accent = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: string
  delta: { pct: number; dir: 'up' | 'down' | 'flat' }
  onClick?: () => void
  invertDelta?: boolean
  accent?: 'blue' | 'emerald' | 'red'
}) {
  const isGood = invertDelta ? d.dir === 'down' : d.dir === 'up'
  const trendColor = d.dir === 'flat' ? '#4b5563' : isGood ? '#34d399' : '#f87171'
  const accentColor = { blue: '#60a5fa', emerald: '#34d399', red: '#f87171' }[accent]

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-white/[0.08] bg-[#0d1117] p-4 hover:border-white/20 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#4b5563]" style={{ color: accentColor }}>{icon}</span>
        {d.dir !== 'flat' && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: trendColor }}>
            {d.dir === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {d.pct.toFixed(1)}%
          </span>
        )}
        {d.dir === 'flat' && <Minus className="w-3 h-3 text-[#4b5563]" />}
      </div>
      <div className="text-2xl font-bold text-[#f9fafb] font-mono mb-1">{value}</div>
      <div className="text-xs text-[#9ca3af]">{label}</div>
      <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-[#2563eb]">
        View leads <ChevronRight className="w-3 h-3" />
      </div>
    </button>
  )
}

// ── Ad spend card ──────────────────────────────────────────────────────────

function AdSpendCard({ label, value, prevValue, adSpend, onAdSpendChange, hint, hideInput = false }: {
  label: string
  value: string | null
  prevValue: string | null
  adSpend: string
  onAdSpendChange: (v: string) => void
  hint: string
  hideInput?: boolean
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0d1117] p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <DollarSign className="w-4 h-4 text-[#4b5563]" />
      </div>
      {value ? (
        <div className="text-2xl font-bold text-[#f9fafb] font-mono mb-1">{value}</div>
      ) : (
        <div className="text-lg font-bold text-[#4b5563] font-mono mb-1">—</div>
      )}
      <div className="text-xs text-[#9ca3af] mb-2">{label}</div>
      <div className="text-[10px] text-[#4b5563]">{hint}</div>
      {!hideInput && (
        <div className="mt-3">
          <input
            type="number"
            min="0"
            value={adSpend}
            onChange={e => onAdSpendChange(e.target.value)}
            placeholder="Enter ad spend ($)"
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-[#f9fafb] placeholder:text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>
      )}
    </div>
  )
}

// ── Funnel chart ───────────────────────────────────────────────────────────

function FunnelChart({ current, data, onStageClick }: {
  current: PeriodStats
  data: VslMetricsResponse
  onStageClick: (title: string, filter: (l: LeadSummary) => boolean) => void
}) {
  const stages = [
    {
      name: 'Booked',
      count: current.booked,
      pct: 100,
      fill: '#2563eb',
      filter: (_l: LeadSummary) => true,
    },
    {
      name: 'Showed',
      count: current.showed,
      pct: current.booked ? (current.showed / current.booked) * 100 : 0,
      fill: '#7c3aed',
      filter: (l: LeadSummary) => l.stage === 'closed_won' || l.stage === 'closed_lost',
    },
    {
      name: 'Closed Won',
      count: current.closed_won,
      pct: current.booked ? (current.closed_won / current.booked) * 100 : 0,
      fill: '#059669',
      filter: (l: LeadSummary) => l.stage === 'closed_won',
    },
  ]

  const dropoffs = [
    current.booked && current.showed < current.booked
      ? `${((1 - current.showed / current.booked) * 100).toFixed(0)}% dropped`
      : null,
    current.showed && current.closed_won < current.showed
      ? `${((1 - current.closed_won / current.showed) * 100).toFixed(0)}% dropped`
      : null,
  ]

  return (
    <div className="space-y-2">
      {/* Visual bars */}
      {stages.map((s, i) => (
        <div key={s.name}>
          <button
            className="w-full group"
            onClick={() => onStageClick(`${s.name} — ${s.count} leads`, s.filter)}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="w-20 text-right text-xs text-[#9ca3af] shrink-0">{s.name}</span>
              <div className="flex-1 relative h-10 flex items-center">
                <div
                  className="h-full rounded-md flex items-center justify-end pr-3 transition-opacity group-hover:opacity-90"
                  style={{
                    width: `${Math.max(s.pct, 2)}%`,
                    backgroundColor: s.fill,
                    minWidth: s.count > 0 ? '48px' : '0',
                  }}
                >
                  {s.count > 0 && (
                    <span className="text-white text-xs font-semibold font-mono">
                      {fmtNum(s.count)}
                    </span>
                  )}
                </div>
                <span className="ml-3 text-xs font-medium text-[#9ca3af] font-mono">
                  {fmtPct(s.pct)}
                </span>
              </div>
            </div>
          </button>
          {i < dropoffs.length && dropoffs[i] && (
            <div className="flex items-center gap-3 my-0.5">
              <span className="w-20" />
              <div className="flex-1 flex items-center gap-2">
                <div className="w-px h-4 ml-3 bg-white/10" />
                <span className="text-[10px] text-[#4b5563]">{dropoffs[i]}</span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Recharts mini breakdown bar (no-show vs pending vs lost) */}
      {current.booked > 0 && (
        <div className="mt-6 pt-5 border-t border-white/[0.06]">
          <p className="text-xs text-[#4b5563] mb-3">Outcome breakdown</p>
          <OutcomeBreakdown current={current} leads={data.leads} onOpenPanel={onStageClick} />
        </div>
      )}
    </div>
  )
}

// ── Outcome breakdown bar ──────────────────────────────────────────────────

function OutcomeBreakdown({ current, leads, onOpenPanel }: {
  current: PeriodStats
  leads: LeadSummary[]
  onOpenPanel: (title: string, filter: (l: LeadSummary) => boolean) => void
}) {
  const segments = [
    { key: 'closed_won',  label: 'Closed Won',  count: current.closed_won,  color: '#059669', filter: (l: LeadSummary) => l.stage === 'closed_won' },
    { key: 'closed_lost', label: 'Closed Lost',  count: current.closed_lost, color: '#b45309', filter: (l: LeadSummary) => l.stage === 'closed_lost' },
    { key: 'no_show',     label: 'No Show',      count: current.no_show,     color: '#dc2626', filter: (l: LeadSummary) => l.stage === 'no_show' },
    { key: 'pending',     label: 'Pending',       count: current.pending,     color: '#374151', filter: (l: LeadSummary) => l.stage === 'call_booked' },
  ].filter(s => s.count > 0)

  if (segments.length === 0) return null

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-6 rounded-md overflow-hidden w-full">
        {segments.map(s => (
          <button
            key={s.key}
            title={`${s.label}: ${s.count}`}
            onClick={() => onOpenPanel(`${s.label} — ${s.count} leads`, s.filter)}
            style={{ width: `${(s.count / current.booked) * 100}%`, backgroundColor: s.color }}
            className="hover:opacity-80 transition-opacity"
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segments.map(s => (
          <button
            key={s.key}
            onClick={() => onOpenPanel(`${s.label} — ${s.count} leads`, s.filter)}
            className="flex items-center gap-1.5 text-xs text-[#9ca3af] hover:text-[#f9fafb] transition-colors"
          >
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}: <span className="font-mono font-semibold">{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Per-closer table ───────────────────────────────────────────────────────

function CloserTable({ closers, leads, onOpenPanel }: {
  closers: CloserStats[]
  leads: LeadSummary[]
  onOpenPanel: (title: string, filter: (l: LeadSummary) => boolean) => void
}) {
  const cols = ['Closer', 'Calls', 'Showed', 'Closed', 'Show %', 'Close %', 'Revenue', 'Avg Deal', 'Trend']

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {cols.map(c => (
              <th key={c} className="px-5 py-3 text-left text-xs font-medium text-[#4b5563] uppercase tracking-wide whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {closers.map((c, idx) => (
            <tr key={c.closer_id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${idx % 2 === 0 ? '' : ''}`}>
              <td className="px-5 py-3.5 font-medium text-[#f9fafb] whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#2563eb]/20 flex items-center justify-center text-[10px] font-bold text-[#60a5fa]">
                    {c.closer_name.slice(0, 2).toUpperCase()}
                  </div>
                  {c.closer_name}
                </div>
              </td>
              <ClickCell
                value={fmtNum(c.booked)}
                onClick={() => onOpenPanel(`${c.closer_name} — All Calls`, l => l.closer_id === c.closer_id)}
              />
              <ClickCell
                value={fmtNum(c.showed)}
                onClick={() => onOpenPanel(`${c.closer_name} — Showed`, l => l.closer_id === c.closer_id && (l.stage === 'closed_won' || l.stage === 'closed_lost'))}
              />
              <ClickCell
                value={fmtNum(c.closed_won)}
                onClick={() => onOpenPanel(`${c.closer_name} — Closed Won`, l => l.closer_id === c.closer_id && l.stage === 'closed_won')}
                className="text-emerald-400"
              />
              <td className="px-5 py-3.5 font-mono text-[#9ca3af]">{fmtPct(c.show_rate)}</td>
              <td className="px-5 py-3.5 font-mono text-[#9ca3af]">{fmtPct(c.close_rate)}</td>
              <ClickCell
                value={fmt$(c.revenue)}
                onClick={() => onOpenPanel(`${c.closer_name} — Revenue`, l => l.closer_id === c.closer_id && l.stage === 'closed_won')}
                className="text-emerald-400"
              />
              <td className="px-5 py-3.5 font-mono text-[#9ca3af]">{fmt$(c.avg_deal)}</td>
              <td className="px-5 py-3.5">
                <TrendBadge trend={c.trend} prev={c.prev_close_rate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClickCell({ value, onClick, className = 'text-[#f9fafb]' }: {
  value: string; onClick: () => void; className?: string
}) {
  return (
    <td className="px-5 py-3.5">
      <button
        onClick={onClick}
        className={`font-mono font-semibold hover:underline hover:text-[#2563eb] transition-colors ${className}`}
      >
        {value}
      </button>
    </td>
  )
}

function TrendBadge({ trend, prev }: { trend: 'up' | 'down' | 'flat'; prev: number }) {
  if (trend === 'flat' || prev === 0) {
    return <span className="flex items-center gap-1 text-xs text-[#4b5563]"><Minus className="w-3 h-3" /> —</span>
  }
  const isUp = trend === 'up'
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '↑' : '↓'} vs prior
    </span>
  )
}

// ── Slide panel ────────────────────────────────────────────────────────────

function LeadsPanel({ panel, onClose }: {
  panel: { title: string; leads: LeadSummary[] } | null
  onClose: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panel) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [panel, onClose])

  if (!panel) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-[#0d1117] border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-[#f9fafb]">{panel.title}</h3>
            <p className="text-xs text-[#4b5563] mt-0.5">{panel.leads.length} lead{panel.leads.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-[#4b5563] hover:text-[#9ca3af] transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {panel.leads.length === 0 && (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-[#4b5563]">No leads in this segment.</p>
            </div>
          )}
          {panel.leads.map(lead => {
            const s = STAGE_LABEL[lead.stage] ?? { label: lead.stage, color: '#9ca3af' }
            return (
              <div key={lead.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#f9fafb] text-sm">{lead.name}</span>
                      {lead.ig_handle && (
                        <span className="text-xs text-[#4b5563]">@{lead.ig_handle}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: s.color + '20', color: s.color }}
                      >
                        {s.label}
                      </span>
                      {lead.booked_at && (
                        <span className="text-xs text-[#4b5563]">
                          Booked {fmtDate(lead.booked_at)}
                        </span>
                      )}
                      {lead.closer_name && (
                        <span className="text-xs text-[#4b5563]">
                          Closer: {lead.closer_name}
                        </span>
                      )}
                    </div>
                    {(lead.email || lead.phone) && (
                      <p className="text-xs text-[#4b5563] mt-1">
                        {[lead.email, lead.phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {lead.deal_value ? (
                      <span className="text-sm font-semibold font-mono text-emerald-400">
                        {fmt$(lead.deal_value)}
                      </span>
                    ) : null}
                    <a
                      href={`/dashboard/crm/${lead.id}`}
                      className="block text-[10px] text-[#2563eb] hover:underline mt-1"
                      onClick={e => e.stopPropagation()}
                    >
                      View lead <ExternalLink className="w-2.5 h-2.5 inline" />
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
