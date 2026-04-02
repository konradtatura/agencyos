'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CadencePoint {
  weekStart: string   // ISO date (Monday), e.g. "2025-03-10"
  count:     number
}

interface Props {
  data:       CadencePoint[]   // exactly 12 points, oldest → newest
  avgPerWeek: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

function weekEnd(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${MONTH_ABBR[m]} ${day}`
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, avgPerWeek }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as CadencePoint
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[12.5px] shadow-xl"
      style={{
        backgroundColor: '#0f172a',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <p className="mb-1.5 font-medium text-[#9ca3af]">
        {fmtShort(point.weekStart)} – {weekEnd(point.weekStart)}
      </p>
      <p className="font-mono font-semibold text-[#f9fafb]">
        {point.count} post{point.count !== 1 ? 's' : ''}
      </p>
      <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[11px] text-[#6b7280]">
        12-week avg: {avgPerWeek.toFixed(1)} / week
      </p>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PostingCadenceChart({ data, avgPerWeek }: Props) {
  const yMax = Math.max(...data.map((p) => p.count), Math.ceil(avgPerWeek), 1)
  const yDomain: [number, number] = [0, Math.ceil(yMax * 1.2)]

  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[#f9fafb]">Posting Cadence</p>
          <p className="mt-0.5 font-mono text-[11px] text-[#6b7280]">
            {avgPerWeek.toFixed(1)} posts / week avg
          </p>
        </div>
        <span
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280' }}
        >
          12W
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />

            <XAxis
              dataKey="weekStart"
              tickFormatter={fmtShort}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
              dy={8}
            />

            <YAxis
              domain={yDomain}
              allowDecimals={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={28}
              tickCount={5}
            />

            <Tooltip
              content={<ChartTooltip avgPerWeek={avgPerWeek} />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />

            <ReferenceLine
              y={avgPerWeek}
              stroke="#6b7280"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `avg ${avgPerWeek.toFixed(1)}`,
                position: 'insideTopRight',
                fill: '#6b7280',
                fontSize: 10,
                dy: -6,
              }}
            />

            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((point, i) => (
                <Cell
                  key={point.weekStart}
                  fill={i === data.length - 1 ? '#3b82f6' : '#2563eb'}
                  fillOpacity={i === data.length - 1 ? 0.7 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
