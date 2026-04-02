'use client'

import {
  ComposedChart,
  Bar,
  Line,
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
  weekStart:    string        // ISO date (Monday), e.g. "2025-03-10"
  count:        number
  newFollowers: number | null // net new followers gained that week (null = no snapshot data)
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
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function fmtFollowers(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
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
      <p className="mb-2 font-medium text-[#9ca3af]">
        {fmtShort(point.weekStart)} – {weekEnd(point.weekStart)}
      </p>

      {/* Posts */}
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: '#2563eb' }} />
        <span className="text-[#d1d5db]">
          <span className="font-mono font-semibold">{point.count}</span>
          {' '}post{point.count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* New followers */}
      <div className="mt-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: '#10b981' }} />
        <span className="text-[#d1d5db]">
          {point.newFollowers != null ? (
            <>
              <span
                className="font-mono font-semibold"
                style={{ color: point.newFollowers >= 0 ? '#10b981' : '#f87171' }}
              >
                {point.newFollowers >= 0 ? '+' : ''}{point.newFollowers}
              </span>
              {' '}new followers
            </>
          ) : (
            <span className="text-[#6b7280]">no follower data</span>
          )}
        </span>
      </div>

      <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-[#6b7280]">
        12-week avg: {avgPerWeek.toFixed(1)} posts / week
      </p>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PostingCadenceChart({ data, avgPerWeek }: Props) {
  // Left axis domain (post count)
  const countMax  = Math.max(...data.map((p) => p.count), Math.ceil(avgPerWeek), 1)
  const leftDomain: [number, number] = [0, Math.ceil(countMax * 1.2)]

  // Right axis domain (new followers) — symmetric padding around the data range
  const followerValues = data.map((p) => p.newFollowers).filter((v): v is number => v != null)
  const followerMin = followerValues.length ? Math.min(...followerValues) : 0
  const followerMax = followerValues.length ? Math.max(...followerValues) : 10
  const followerPad = Math.max(Math.abs(followerMax - followerMin) * 0.2, 5)
  const rightDomain: [number, number] = [
    Math.floor(followerMin - followerPad),
    Math.ceil(followerMax  + followerPad),
  ]

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
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] text-[#6b7280]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: '#2563eb' }} />
              Posts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ backgroundColor: '#10b981' }} />
              New followers
            </span>
          </div>
          <span
            className="rounded-md px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280' }}
          >
            12W
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 52, bottom: 0, left: 0 }} barCategoryGap="30%">
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

            {/* Left axis — post count */}
            <YAxis
              yAxisId="left"
              domain={leftDomain}
              allowDecimals={false}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={28}
              tickCount={5}
            />

            {/* Right axis — new followers */}
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={rightDomain}
              tickFormatter={fmtFollowers}
              tick={{ fill: '#10b981', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickCount={5}
              label={{
                value: 'New followers',
                angle: 90,
                position: 'insideRight',
                offset: 46,
                style: { fill: '#6b7280', fontSize: 10 },
              }}
            />

            <Tooltip
              content={<ChartTooltip avgPerWeek={avgPerWeek} />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />

            <ReferenceLine
              yAxisId="left"
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

            <Bar yAxisId="left" dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((point, i) => (
                <Cell
                  key={point.weekStart}
                  fill={i === data.length - 1 ? '#3b82f6' : '#2563eb'}
                  fillOpacity={i === data.length - 1 ? 0.7 : 0.85}
                />
              ))}
            </Bar>

            <Line
              yAxisId="right"
              type="monotone"
              dataKey="newFollowers"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3, fill: '#10b981', stroke: '#111827', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: '#10b981', stroke: '#111827', strokeWidth: 2 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
