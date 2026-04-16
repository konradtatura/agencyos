'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { AlertTriangle, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { CrmMetricsResponse, CloserRow, SetterRow } from '@/app/api/metrics/crm/route'
import DateRangePicker from '@/components/ui/date-range-picker'

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'
type Source = 'dm' | 'vsl' | 'all'

const METRIC_DEFS = [
  { key: 'dm_to_qualified',     label: 'DM → Qualified',   benchmark: null },
  { key: 'book_rate',           label: 'Book Rate',         benchmark: 15   },
  { key: 'show_rate',           label: 'Show Rate',         benchmark: 60   },
  { key: 'close_rate',          label: 'Close Rate',        benchmark: 20   },
  { key: 'offer_rate',          label: 'Offer Rate',        benchmark: 80   },
  { key: 'end_to_end',          label: 'End-to-End',        benchmark: null },
  { key: 'no_show_rate',        label: 'No Show Rate',      benchmark: null },
  { key: 'cancel_rate',         label: 'Cancel Rate',       benchmark: null },
  { key: 'dq_rate',             label: 'DQ Rate',           benchmark: null },
  { key: 'downgrade_conversion',label: 'Downgrade Conv.',   benchmark: null },
] as const

type MetricKey = typeof METRIC_DEFS[number]['key']

const LINE_COLORS: Record<string, string> = {
  show_rate:   '#2563eb',
  close_rate:  '#10b981',
  book_rate:   '#f59e0b',
  offer_rate:  '#8b5cf6',
}

const CARD = {
  backgroundColor: '#111827',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
} as const

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtPct(n: number | null | undefined) {
  if (n == null) return 'N/A'
  return `${n.toFixed(1)}%`
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtNum(n: number) {
  return n.toLocaleString()
}

// ── Status color helper ────────────────────────────────────────────────────────

function rateStatus(value: number, benchmark: number | null, inverse = false): 'green' | 'amber' | 'red' | 'neutral' {
  if (benchmark == null) return 'neutral'
  if (inverse) {
    // lower is better (no_show_rate, cancel_rate, dq_rate)
    const pctAbove = ((value - benchmark) / benchmark) * 100
    if (pctAbove >= 20) return 'red'
    if (pctAbove >= 10) return 'amber'
    return 'green'
  }
  const pctBelow = ((benchmark - value) / benchmark) * 100
  if (pctBelow >= 20) return 'red'
  if (pctBelow >= 5)  return 'amber'
  return 'green'
}

const STATUS_BORDER: Record<string, string> = {
  green:   '1px solid rgba(16,185,129,0.3)',
  amber:   '1px solid rgba(245,158,11,0.3)',
  red:     '1px solid rgba(239,68,68,0.3)',
  neutral: '1px solid rgba(255,255,255,0.06)',
}

const STATUS_BAR_COLOR: Record<string, string> = {
  green:   '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  neutral: '#2563eb',
}

// ── Sort helper ────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null

function useSortableTable<T>(rows: T[]) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  function handleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, handleSort }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || dir === null) return <ChevronsUpDown className="h-3 w-3 text-[#4b5563]" />
  if (dir === 'asc')  return <ChevronUp   className="h-3 w-3 text-[#9ca3af]" />
  return <ChevronDown className="h-3 w-3 text-[#9ca3af]" />
}

function Th({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string; col: string
  sortKey: string | null; sortDir: SortDir
  onSort: (k: string) => void
}) {
  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[#6b7280] hover:text-[#9ca3af]"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon active={sortKey === col} dir={sortKey === col ? sortDir : null} />
      </span>
    </th>
  )
}

// ── Micro sparkline ────────────────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return <span className="text-[#4b5563] text-[11px]">—</span>
  const max = Math.max(...data, 1)
  const h = 24
  const w = 6
  const gap = 2
  const total = data.length * (w + gap) - gap
  return (
    <svg width={total} height={h} className="overflow-visible">
      {data.map((v, i) => {
        const barH = Math.max(2, (v / max) * h)
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - barH}
            width={w}
            height={barH}
            rx={1}
            fill={color}
            opacity={0.8}
          />
        )
      })}
    </svg>
  )
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p className="mb-1 text-[11px] text-[#9ca3af]">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono">
          {p.name}: {typeof p.value === 'number' ? `${p.value.toFixed(1)}%` : p.value}
        </p>
      ))}
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-96 bg-white/[0.06]" />
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-32 bg-white/[0.06] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 bg-white/[0.06] rounded-xl" />
      <Skeleton className="h-64 bg-white/[0.06] rounded-xl" />
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 text-center"
      style={CARD}
    >
      <div className="mb-3 text-[40px]">📊</div>
      <p className="text-[15px] font-medium text-[#f9fafb]">No leads in CRM yet</p>
      <p className="mt-1 text-[13px] text-[#6b7280]">
        Add your first lead to start tracking conversion metrics.
      </p>
    </div>
  )
}

// ── SECTION: Alert Banner ──────────────────────────────────────────────────────

function AlertBanner({ alerts }: { alerts: CrmMetricsResponse['alerts'] }) {
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('crm_dismissed_alerts') ?? '[]')
      setDismissed(stored)
    } catch { /* ignore */ }
  }, [])

  function dismiss(key: string) {
    const next = [...dismissed, key]
    setDismissed(next)
    try { localStorage.setItem('crm_dismissed_alerts', JSON.stringify(next)) } catch { /* ignore */ }
  }

  const visible = alerts.filter(a => !dismissed.includes(`${a.metric}-${a.current_value}`))
  if (!visible.length) return null

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
    >
      {visible.map(a => {
        const key = `${a.metric}-${a.current_value}`
        return (
          <div key={key} className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 text-[13px] text-[#fca5a5]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#ef4444]" />
              <span>
                <span className="font-semibold">{a.metric} is {fmtPct(a.current_value)}</span>
                {' — '}{a.delta_points} points below your 30-day average
                {a.supporting_fact ? `. ${a.supporting_fact}.` : '.'}
              </span>
            </div>
            <button
              onClick={() => dismiss(key)}
              className="shrink-0 rounded p-0.5 hover:bg-white/10 text-[#9ca3af] hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── SECTION: Funnel Visualization ─────────────────────────────────────────────

function FunnelViz({ funnel, rates, source }: { funnel: CrmMetricsResponse['funnel']; rates: CrmMetricsResponse['rates']; source: Source }) {
  const benchmarks = { qualified: null, call_booked: 15, showed: 60, closed_won: 20 }
  const stages = [
    { key: 'total_leads_entered', label: source === 'vsl' ? 'Booked' : 'DM\'d', count: funnel.total_leads_entered, convLabel: null },
    { key: 'qualified',           label: 'Qualified',    count: funnel.qualified,           convLabel: `${fmtPct(rates.dm_to_qualified)} qualified` },
    { key: 'call_booked',         label: 'Call Booked',  count: funnel.call_booked,         convLabel: `${fmtPct(rates.book_rate)} booked` },
    { key: 'showed',              label: 'Showed',       count: funnel.showed,              convLabel: `${fmtPct(rates.show_rate)} showed` },
    { key: 'closed_won',          label: 'Closed Won',   count: funnel.closed_won,          convLabel: `${fmtPct(rates.close_rate)} closed` },
  ] as const

  const max = funnel.total_leads_entered || 1

  return (
    <div className="rounded-xl p-5 space-y-1" style={CARD}>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">Pipeline Funnel</p>
      {stages.map((stage, idx) => {
        const pctOfFirst = max > 0 ? Math.round((stage.count / max) * 100 * 10) / 10 : 0
        // Determine bar color: compare stage-specific rate vs benchmark
        const bm = benchmarks[stage.key as keyof typeof benchmarks]
        let barColor = '#2563eb'
        if (stage.key === 'call_booked') barColor = STATUS_BAR_COLOR[rateStatus(rates.book_rate, 15)]
        else if (stage.key === 'showed') barColor = STATUS_BAR_COLOR[rateStatus(rates.show_rate, 60)]
        else if (stage.key === 'closed_won') barColor = STATUS_BAR_COLOR[rateStatus(rates.close_rate, 20)]

        return (
          <div key={stage.key}>
            {/* Connector arrow */}
            {idx > 0 && stage.convLabel && (
              <div className="flex items-center gap-2 py-1 pl-1">
                <span className="text-[11px] text-[#4b5563]">↓</span>
                <span className="text-[11px] text-[#4b5563]">{stage.convLabel}</span>
              </div>
            )}
            {/* Stage row */}
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-[12.5px] text-[#9ca3af]">{stage.label}</div>
              <div className="flex-1 relative h-5 rounded overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                  style={{
                    width: `${pctOfFirst}%`,
                    backgroundColor: barColor,
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="w-16 shrink-0 text-right font-mono text-[12.5px] text-[#f9fafb]">{fmtNum(stage.count)}</div>
              <div className="w-12 shrink-0 text-right text-[11px] text-[#6b7280]">{pctOfFirst}%</div>
            </div>
          </div>
        )
      })}

      {/* Downgrade sub-section */}
      {funnel.disqualified > 0 && (
        <div
          className="mt-4 rounded-lg px-4 py-3 text-[12.5px] text-[#9ca3af]"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="font-medium text-[#f9fafb]">Downgrade Pipeline: </span>
          {fmtNum(funnel.disqualified)} disqualified → {fmtNum(funnel.downgrade_closed)} closed
          {' = '}
          <span className="font-mono text-[#f59e0b]">{fmtPct(rates.downgrade_conversion)}</span>
          {' downgrade conversion'}
        </div>
      )}
    </div>
  )
}

// ── SECTION: Metric Cards ──────────────────────────────────────────────────────

function MetricCard({
  label, value, prevValue, benchmark, sparkData,
}: {
  label: string
  value: number
  prevValue: number
  benchmark: number | null
  sparkData: number[]
}) {
  const delta = Math.round((value - prevValue) * 10) / 10
  const status = rateStatus(value, benchmark)
  const isHealthy = status === 'green' || status === 'neutral'
  const lineColor = isHealthy ? '#2563eb' : '#ef4444'

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ ...CARD, border: STATUS_BORDER[status] }}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#6b7280]">{label}</p>
      <p className="font-mono text-[24px] font-semibold leading-none text-[#f9fafb]">{fmtPct(value)}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {delta > 0 && <span className="text-[11px] font-medium text-[#10b981]">↑ {delta}pts</span>}
          {delta < 0 && <span className="text-[11px] font-medium text-[#ef4444]">↓ {Math.abs(delta)}pts</span>}
          {delta === 0 && <span className="text-[11px] text-[#4b5563]">—</span>}
          <span className="text-[10px] text-[#4b5563]">WoW</span>
        </div>
        {benchmark != null && (
          <span className="text-[10px] text-[#4b5563]">bm {benchmark}%</span>
        )}
      </div>
      {/* Sparkline */}
      {sparkData.length > 0 && (
        <div className="h-[40px]">
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparkData.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={lineColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── SECTION: Setter Table ──────────────────────────────────────────────────────

function SetterTable({ setters, sparklinesByUser }: { setters: SetterRow[]; sparklinesByUser: Record<string, number[]> }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortableTable(setters)
  const teamAvgBookRate = setters.length
    ? setters.reduce((s, r) => s + r.book_rate, 0) / setters.length
    : 0

  function bookRateColor(rate: number) {
    if (teamAvgBookRate === 0) return '#9ca3af'
    const below = ((teamAvgBookRate - rate) / teamAvgBookRate) * 100
    if (below >= 20) return '#ef4444'
    if (below >= 10) return '#f59e0b'
    return '#10b981'
  }

  if (!setters.length) return (
    <div className="py-8 text-center text-[13px] text-[#6b7280]">No setter EOD data for this period.</div>
  )

  // Best setter by total_booked this week
  const best = [...setters].sort((a, b) => b.total_booked - a.total_booked)[0]

  return (
    <div>
      {best && best.total_booked > 0 && (
        <p className="mb-3 text-[13px] text-[#9ca3af]">
          🏆 <span className="font-semibold text-[#f9fafb]">{best.name}</span>
          {' — '}{best.total_booked} calls booked ({fmtPct(best.book_rate)} book rate)
        </p>
      )}
      <div className="overflow-x-auto rounded-xl" style={CARD}>
        <table className="w-full min-w-[800px] border-collapse text-[12.5px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                ['name',              'Name'],
                ['outbound_sent',     'Outbound'],
                ['inbound_received',  'Inbound'],
                ['booking_links_sent','Links Sent'],
                ['total_booked',      'Booked'],
                ['book_rate',         'Book %'],
                ['streak',            'Streak'],
              ] as [string, string][]).map(([col, label]) => (
                <Th key={col} label={label} col={col} sortKey={sortKey as string | null} sortDir={sortDir} onSort={handleSort as (k: string) => void} />
              ))}
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">7d Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-3 py-2.5 font-medium text-[#f9fafb]">{s.name}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{s.outbound_sent || <span className="text-[#4b5563]">N/A</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{s.inbound_received || <span className="text-[#4b5563]">N/A</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{s.booking_links_sent || <span className="text-[#4b5563]">N/A</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{s.total_booked || <span className="text-[#4b5563]">N/A</span>}</td>
                <td className="px-3 py-2.5 font-mono" style={{ color: bookRateColor(s.book_rate) }}>
                  {s.total_booked ? fmtPct(s.book_rate) : <span className="text-[#4b5563]">N/A</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">
                  {s.streak > 0 ? `${s.streak}${s.streak >= 7 ? ' 🔥' : ''}` : <span className="text-[#4b5563]">0</span>}
                </td>
                <td className="px-3 py-2.5">
                  <MiniSparkline data={sparklinesByUser[s.user_id] ?? []} color="#f59e0b" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── SECTION: Closer Table ──────────────────────────────────────────────────────

function CloserTable({ closers }: { closers: CloserRow[] }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortableTable(closers)
  const teamAvgClose = closers.length
    ? closers.reduce((s, r) => s + r.close_rate, 0) / closers.length
    : 0

  if (!closers.length) return (
    <div className="py-8 text-center text-[13px] text-[#6b7280]">No closer EOD data.</div>
  )

  function closeColor(rate: number) {
    if (!teamAvgClose) return '#9ca3af'
    const below = ((teamAvgClose - rate) / (teamAvgClose || 1)) * 100
    if (below >= 30) return '#ef4444'
    if (below >= 15) return '#f59e0b'
    return '#10b981'
  }

  const cols: [keyof CloserRow, string][] = [
    ['name',              'Name'],
    ['calls_booked',      'Booked'],
    ['showed',            'Showed'],
    ['no_showed',         'No Show'],
    ['rescheduled',       'Reschedule'],
    ['calls_taken',       'Taken'],
    ['closes',            'Closes'],
    ['deposits',          'Deposits'],
    ['disqualified_count','DQ'],
    ['close_rate',        'Close%'],
    ['show_rate',         'Show%'],
    ['no_show_rate',      'NoShow%'],
    ['dq_rate',           'DQ%'],
    ['cash_collected',    'Cash'],
    ['revenue_generated', 'Revenue'],
    ['aov',               'AOV'],
    ['followup_payments', 'Plans'],
  ]

  return (
    <div className="overflow-x-auto rounded-xl" style={CARD}>
      <table className="w-full min-w-[1200px] border-collapse text-[12.5px]">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {cols.map(([col, label]) => (
              <Th key={col} label={label} col={col as string} sortKey={sortKey as string | null} sortDir={sortDir} onSort={handleSort as (k: string) => void} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => {
            const hasData = c.calls_taken > 0

            return (
              <tr key={c.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-3 py-2.5 font-medium text-[#f9fafb]">{c.name}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtNum(c.calls_booked) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtNum(c.showed) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#ef4444]">{hasData ? fmtNum(c.no_showed) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtNum(c.rescheduled) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtNum(c.calls_taken) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#10b981]">{hasData ? fmtNum(c.closes) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtUSD(c.deposits) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtNum(c.disqualified_count) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: hasData ? closeColor(c.close_rate) : '#4b5563' }}>
                  {hasData ? fmtPct(c.close_rate) : '—'}
                </td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtPct(c.show_rate) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#ef4444]">{hasData ? fmtPct(c.no_show_rate) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtPct(c.dq_rate) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#10b981]">{hasData ? fmtUSD(c.cash_collected) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#60a5fa]">{hasData ? fmtUSD(c.revenue_generated) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtUSD(c.aov) : <span className="text-[#4b5563]">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{hasData ? fmtNum(c.followup_payments) : <span className="text-[#4b5563]">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── SECTION: Trend Charts ──────────────────────────────────────────────────────

const TOGGLEABLE_METRICS: { key: string; label: string; color: string }[] = [
  { key: 'show_rate',  label: 'Show Rate',  color: LINE_COLORS.show_rate  },
  { key: 'close_rate', label: 'Close Rate', color: LINE_COLORS.close_rate },
  { key: 'book_rate',  label: 'Book Rate',  color: LINE_COLORS.book_rate  },
  { key: 'offer_rate', label: 'Offer Rate', color: LINE_COLORS.offer_rate },
]

function TrendCharts({
  sparklines,
  weeklyTrend,
  benchmarks,
}: {
  sparklines: CrmMetricsResponse['sparklines']
  weeklyTrend: CrmMetricsResponse['weekly_trend']
  benchmarks: CrmMetricsResponse['benchmarks']
}) {
  const [activeLines, setActiveLines] = useState(['show_rate', 'close_rate', 'book_rate'])

  function toggleLine(key: string) {
    setActiveLines(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  // This week vs last week
  const thisWeekData = sparklines.slice(-7)
  const lastWeekData = sparklines.slice(-14, -7)

  const weekCompData = (['show_rate', 'close_rate', 'book_rate', 'offer_rate'] as const).map(k => ({
    metric: TOGGLEABLE_METRICS.find(m => m.key === k)?.label ?? k,
    'This Week': thisWeekData.length ? thisWeekData.reduce((s, d) => s + d[k], 0) / thisWeekData.length : 0,
    'Last Week': lastWeekData.length ? lastWeekData.reduce((s, d) => s + d[k], 0) / lastWeekData.length : 0,
  }))

  // Weekly trend table cell color
  function cellStatus(value: number, metric: string): string {
    const bm = (benchmarks as Record<string, number>)[metric]
    if (!bm) return 'transparent'
    const s = rateStatus(value, bm)
    if (s === 'green')   return 'rgba(16,185,129,0.15)'
    if (s === 'amber')   return 'rgba(245,158,11,0.15)'
    if (s === 'red')     return 'rgba(239,68,68,0.15)'
    return 'transparent'
  }

  return (
    <div className="space-y-5">
      {/* Chart A: 90-day rate trends */}
      <div className="rounded-xl p-5" style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">30-Day Rate Trends</p>
          <div className="flex gap-2">
            {TOGGLEABLE_METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => toggleLine(m.key)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: activeLines.includes(m.key) ? `${m.color}22` : 'rgba(255,255,255,0.04)',
                  color: activeLines.includes(m.key) ? m.color : '#6b7280',
                  border: `1px solid ${activeLines.includes(m.key) ? m.color + '44' : 'transparent'}`,
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeLines.includes(m.key) ? m.color : '#4b5563' }} />
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={sparklines} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={d => d.slice(5)} interval={4} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${v}%`} />
            <Tooltip content={<ChartTooltip />} />
            {TOGGLEABLE_METRICS.filter(m => activeLines.includes(m.key)).map(m => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart B: This week vs last week */}
      <div className="rounded-xl p-5" style={CARD}>
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">This Week vs Last Week</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekCompData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Bar dataKey="This Week" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Last Week" fill="rgba(255,255,255,0.15)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart C: 12-week trend table */}
      <div className="rounded-xl p-5" style={CARD}>
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">12-Week Trend</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-[12px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Week', 'Book %', 'Show %', 'Close %', 'Offer %', 'End-to-End'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...weeklyTrend].reverse().map(w => (
                <tr key={w.week_start} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-3 py-2 text-[#9ca3af]">{w.week_label}</td>
                  {[
                    { val: w.book_rate,  bm: 'book_rate'  },
                    { val: w.show_rate,  bm: 'show_rate'  },
                    { val: w.close_rate, bm: 'close_rate' },
                    { val: w.offer_rate, bm: 'offer_rate' },
                    { val: w.end_to_end, bm: null         },
                  ].map(({ val, bm }, i) => (
                    <td
                      key={i}
                      className="px-3 py-2 font-mono font-medium text-[#f9fafb]"
                      style={{ backgroundColor: bm ? cellStatus(val, bm) : 'transparent' }}
                    >
                      {fmtPct(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const VSL_METRIC_KEYS = new Set(['show_rate', 'close_rate', 'offer_rate', 'no_show_rate', 'cancel_rate', 'dq_rate'])

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'dm',  label: 'DM Pipeline' },
  { value: 'vsl', label: 'VSL Funnel'  },
  { value: 'all', label: 'Both'        },
]

export default function MetricsDashboard() {
  const [range, setRange]           = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState<string | undefined>()
  const [customTo,   setCustomTo]   = useState<string | undefined>()
  const [source, setSource]         = useState<Source>('all')
  const [data, setData]             = useState<CrmMetricsResponse | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [closerTab, setCloserTab]   = useState<'all_time' | 'current_month'>('current_month')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ range, source })
      if (range === 'custom' && customFrom) params.set('from', customFrom)
      if (range === 'custom' && customTo)   params.set('to', customTo)
      const res = await fetch(`/api/metrics/crm?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json: CrmMetricsResponse = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }, [range, source, customFrom, customTo])

  useEffect(() => { fetchData() }, [fetchData])

  const isEmpty = !loading && !error && data && data.funnel.total_leads_entered === 0 && data.setters.length === 0 && data.closers_all_time.length === 0

  // Build sparkline data per metric key
  const sparkByMetric = useMemo(() => {
    if (!data) return {} as Record<MetricKey, number[]>
    const out = {} as Record<MetricKey, number[]>
    for (const def of METRIC_DEFS) {
      out[def.key] = data.sparklines.map(s => (s as unknown as Record<string, number>)[def.key] ?? 0)
    }
    return out
  }, [data])

  // Setter sparklines: last 7 days of total_booked — we don't have per-user daily from API
  // Use an empty array; the API could be extended later to provide this
  const setterSparklines: Record<string, number[]> = {}

  return (
    <div className="space-y-6">
      {/* Time range picker */}
      <DateRangePicker
        value={{ range, from: customFrom, to: customTo }}
        onChange={(v) => {
          setRange(v.range as Range)
          setCustomFrom(v.from)
          setCustomTo(v.to)
        }}
      />

      {/* Source selector */}
      <div className="flex flex-col gap-2">
        <div
          className="inline-flex gap-1 rounded-lg p-1"
          style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {SOURCE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSource(value)}
              className="rounded-md text-[13px] font-medium transition-colors"
              style={{
                backgroundColor: source === value ? '#2563eb' : 'transparent',
                color:           source === value ? '#ffffff' : '#9ca3af',
                border:          'none',
                padding:         '5px 14px',
                cursor:          'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {source === 'all' && (
          <div
            className="w-full rounded-lg px-3 py-2 text-[11px]"
            style={{
              backgroundColor: 'rgba(245,158,11,0.08)',
              border:          '1px solid rgba(245,158,11,0.2)',
              color:           '#fbbf24',
            }}
          >
            Showing combined DM + VSL data — rates may be misleading. Use DM or VSL tabs for accurate per-funnel metrics.
          </div>
        )}
      </div>

      {loading && <DashboardSkeleton />}
      {error && (
        <div className="rounded-xl p-6 text-center text-[13px] text-[#ef4444]" style={CARD}>
          Failed to load metrics: {error}
        </div>
      )}
      {isEmpty && <EmptyState />}

      {!loading && !error && data && !isEmpty && (
        <>
          {/* Alert Banner */}
          {data.alerts.length > 0 && <AlertBanner alerts={data.alerts} />}

          {/* Funnel Visualization */}
          <FunnelViz funnel={data.funnel} rates={data.rates} source={source} />

          {/* Metric Cards — filtered by source */}
          <div className="grid grid-cols-5 gap-3">
            {METRIC_DEFS.filter(def =>
              source === 'vsl' ? VSL_METRIC_KEYS.has(def.key) : true
            ).map(def => (
              <MetricCard
                key={def.key}
                label={def.label}
                value={(data.rates as Record<string, number>)[def.key] ?? 0}
                prevValue={(data.prev_rates as Record<string, number>)[def.key] ?? 0}
                benchmark={def.benchmark}
                sparkData={sparkByMetric[def.key] ?? []}
              />
            ))}
          </div>

          {/* Per-Setter Table */}
          <div className="rounded-xl p-5" style={CARD}>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">Setter Performance</p>
            <SetterTable setters={data.setters} sparklinesByUser={setterSparklines} />
          </div>

          {/* Per-Closer Table */}
          <div className="rounded-xl p-5" style={CARD}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">Closer Performance</p>
              <div className="flex gap-1">
                {(['current_month', 'all_time'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setCloserTab(tab)}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                    style={{
                      backgroundColor: closerTab === tab ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)',
                      color: closerTab === tab ? '#60a5fa' : '#9ca3af',
                    }}
                  >
                    {tab === 'current_month' ? 'Current Month' : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            {/* Best / needs attention */}
            {(() => {
              const rows = closerTab === 'all_time' ? data.closers_all_time : data.closers_current_month
              const withData = rows.filter(r => r.calls_taken > 0)
              if (!withData.length) return null
              const best = [...withData].sort((a, b) => b.close_rate - a.close_rate)[0]
              const worst = withData.length > 1 ? [...withData].sort((a, b) => a.close_rate - b.close_rate)[0] : null
              return (
                <div className="mb-3 flex items-center gap-4 text-[12.5px]">
                  <span>🏆 <span className="font-semibold text-[#f9fafb]">{best.name}</span> — {fmtPct(best.close_rate)} close rate this {closerTab === 'current_month' ? 'month' : 'all time'}</span>
                  {worst && worst.user_id !== best.user_id && worst.calls_taken >= 3 && (
                    <span className="text-[#f59e0b]">⚠️ Needs attention: <span className="font-semibold">{worst.name}</span> — {fmtPct(worst.close_rate)} close rate ({worst.calls_taken} calls)</span>
                  )}
                </div>
              )
            })()}

            <CloserTable
              closers={closerTab === 'all_time' ? data.closers_all_time : data.closers_current_month}
            />
          </div>

          {/* Trend Charts */}
          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">Trends</p>
            <TrendCharts
              sparklines={data.sparklines}
              weeklyTrend={data.weekly_trend}
              benchmarks={data.benchmarks}
            />
          </div>
        </>
      )}
    </div>
  )
}
