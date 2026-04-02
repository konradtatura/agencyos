'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PostEngPoint {
  weekStart:  string   // ISO date (Monday of that week), e.g. "2025-03-10"
  avgEngRate: number   // percentage, e.g. 4.23
  postCount:  number   // posts in that week
}

type Range = 30 | 90

interface Props {
  data:        PostEngPoint[]   // all weeks, oldest-first
  allTimeAvg:  number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtWeekLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, allTimeAvg }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as PostEngPoint
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[12.5px] shadow-xl"
      style={{
        backgroundColor: '#0f172a',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <p className="mb-1.5 font-medium text-[#9ca3af]">
        Week of {fmtWeekLabel(point.weekStart)}
      </p>
      <p className="font-mono font-semibold text-[#f9fafb]">
        {fmtPct(point.avgEngRate)} avg eng. rate
      </p>
      <p className="mt-0.5 text-[11px] text-[#6b7280]">
        {point.postCount} post{point.postCount !== 1 ? 's' : ''}
      </p>
      {allTimeAvg != null && (
        <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[11px] text-[#6b7280]">
          All-time avg: {fmtPct(allTimeAvg)}
        </p>
      )}
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
      {([30, 90] as Range[]).map((r) => (
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

export default function EngagementRateChart({ data, allTimeAvg }: Props) {
  const [range, setRange] = useState<Range>(30)

  const points = useMemo(() => {
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - range)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return data.filter((p) => p.weekStart >= cutoffStr)
  }, [data, range])

  const { yMin, yMax } = useMemo(() => {
    const allValues = [
      ...points.map((p) => p.avgEngRate),
      ...(allTimeAvg != null ? [allTimeAvg] : []),
    ]
    if (!allValues.length) return { yMin: 0, yMax: 10 }
    const lo = Math.min(...allValues)
    const hi = Math.max(...allValues)
    const pad = Math.max((hi - lo) * 0.2, 0.5)
    return { yMin: Math.max(0, lo - pad), yMax: hi + pad }
  }, [points, allTimeAvg])

  const hasEnoughData = points.length >= 2

  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[#f9fafb]">Avg Engagement Rate</p>
          {allTimeAvg != null && (
            <p className="mt-0.5 font-mono text-[11px] text-[#6b7280]">
              {fmtPct(allTimeAvg)} all-time avg
            </p>
          )}
        </div>
        <RangeTabs range={range} onChange={setRange} />
      </div>

      {/* Chart */}
      <div style={{ height: 280 }}>
        {hasEnoughData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
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
                dataKey="weekStart"
                tickFormatter={fmtWeekLabel}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
                dy={8}
              />

              <YAxis
                domain={[yMin, yMax]}
                tickFormatter={fmtPct}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickCount={5}
              />

              <Tooltip
                content={<ChartTooltip allTimeAvg={allTimeAvg} />}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />

              {allTimeAvg != null && (
                <ReferenceLine
                  y={allTimeAvg}
                  stroke="#6b7280"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{
                    value: `avg ${fmtPct(allTimeAvg)}`,
                    position: 'insideTopRight',
                    fill: '#6b7280',
                    fontSize: 10,
                    dy: -6,
                  }}
                />
              )}

              <Area
                type="monotone"
                dataKey="avgEngRate"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#engGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#2563eb', stroke: '#0f172a', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-[13px]" style={{ color: '#4b5563' }}>
              Not enough post data yet.<br />Sync your content library to see engagement trends.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
