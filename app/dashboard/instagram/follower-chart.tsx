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
  date: string        // ISO date, e.g. "2025-03-01"
  label: string       // formatted, e.g. "Mar 1"
  followers: number
}

interface Props {
  snapshots: Snapshot[]   // newest-first, up to 90 rows
  totalFollowers: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
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
        {point.followers.toLocaleString()} followers
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

// ── Y-axis tick formatter ──────────────────────────────────────────────────────

function yTickFmt(value: number) {
  return fmtFollowers(Math.round(value))
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FollowerChart({ snapshots, totalFollowers }: Props) {
  const [range, setRange] = useState<Range>(30)

  // Build chart data: take the last `range` snapshots (they arrive newest-first),
  // reverse to chronological order, then reconstruct absolute follower counts
  // by walking backwards from the known total.
  const points = useMemo<ChartPoint[]>(() => {
    const slice = snapshots.slice(0, range).reverse()   // oldest → newest
    if (!slice.length) return []

    // We know today's total; walk backwards from the newest snapshot to
    // reconstruct absolute follower counts. Each snapshot's followers_count
    // is the net daily delta.
    const points: ChartPoint[] = new Array(slice.length)
    let t = totalFollowers ?? 0
    for (let i = slice.length - 1; i >= 0; i--) {
      points[i] = { date: slice[i].date, label: fmtLabel(slice[i].date), followers: Math.max(0, t) }
      t -= (slice[i].followers_count ?? 0)
    }
    return points
  }, [snapshots, range, totalFollowers])

  // Compute Y domain with some padding
  const { yMin, yMax } = useMemo(() => {
    if (!points.length) return { yMin: 0, yMax: 100 }
    const values = points.map((p) => p.followers)
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
        <div>
          <p className="text-[13px] font-semibold text-[#f9fafb]">Follower Growth</p>
          {totalFollowers != null && (
            <p className="mt-0.5 font-mono text-[11px] text-[#6b7280]">
              {totalFollowers.toLocaleString()} total
            </p>
          )}
        </div>
        <RangeTabs range={range} onChange={setRange} />
      </div>

      {/* Chart area — always 280px tall */}
      <div style={{ height: 280 }}>
        {hasEnoughData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={yTickFmt}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickCount={5}
                allowDecimals={false}
              />

              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="followers"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#blueGrad)"
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
