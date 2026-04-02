'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Snapshot } from './kpi-grid'

// ── Types ──────────────────────────────────────────────────────────────────────

type Range = 7 | 30 | 90

interface ChartPoint {
  date:  string
  label: string
  reach: number
}

interface Props {
  snapshots: Snapshot[]   // newest-first, up to 90 rows
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as ChartPoint
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[12.5px] shadow-xl"
      style={{
        backgroundColor: '#0f172a',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <p className="mb-1 font-medium text-[#9ca3af]">{point.label}</p>
      <p className="font-mono font-semibold text-[#f9fafb]">
        {point.reach.toLocaleString()} reach
      </p>
    </div>
  )
}

// ── Range tabs ─────────────────────────────────────────────────────────────────

function RangeTabs({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
    >
      {([7, 30, 90] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className="rounded-md px-3 py-1 text-[11px] font-semibold transition-all"
          style={
            range === r
              ? { backgroundColor: '#2563eb', color: '#ffffff' }
              : { color: '#6b7280' }
          }
        >
          {r}D
        </button>
      ))}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ReachChart({ snapshots }: Props) {
  const [range, setRange] = useState<Range>(30)

  const points = useMemo<ChartPoint[]>(() => {
    return snapshots
      .slice(0, range)
      .reverse()
      .filter((s) => s.reach != null)
      .map((s) => ({
        date:  s.date,
        label: fmtLabel(s.date),
        reach: s.reach as number,
      }))
  }, [snapshots, range])

  const { yMin, yMax } = useMemo(() => {
    if (!points.length) return { yMin: 0, yMax: 100 }
    const values = points.map((p) => p.reach)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = Math.max(Math.round((hi - lo) * 0.15), 10)
    return { yMin: Math.max(0, lo - pad), yMax: hi + pad }
  }, [points])

  const hasEnoughData = points.length >= 2

  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#f9fafb]">Daily Reach</p>
        <RangeTabs range={range} onChange={setRange} />
      </div>

      {/* Chart */}
      <div style={{ height: 280 }}>
        {hasEnoughData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2563eb" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />

              <XAxis
                dataKey="label"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
                dy={8}
              />

              <YAxis
                domain={[yMin, yMax]}
                tickFormatter={fmtK}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickCount={5}
              />

              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="reach"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#reachGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#2563eb', stroke: '#0f172a', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-[13px]" style={{ color: '#4b5563' }}>
              Not enough data yet.<br />Check back after a few syncs.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
