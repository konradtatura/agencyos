'use client'

import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { Snapshot } from './kpi-grid'

type Range = 7 | 30 | 90

interface ChartPoint {
  date:   string
  label:  string
  net:    number   // follows - unfollows (or just followers_count delta if no unfollows data)
  follows:   number
  unfollows: number
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH_ABBR[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as ChartPoint
  const hasBreakdown = p.follows > 0 || p.unfollows > 0
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[12px] shadow-xl"
      style={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <p className="mb-1.5 font-medium text-[#9ca3af]">{p.label}</p>
      {hasBreakdown ? (
        <>
          <p className="font-mono text-[#34d399]">+{p.follows.toLocaleString()} follows</p>
          <p className="font-mono text-[#f87171]">−{p.unfollows.toLocaleString()} unfollows</p>
          <p className="mt-1 border-t border-white/10 pt-1 font-mono font-semibold text-[#f9fafb]">
            {p.net >= 0 ? '+' : ''}{p.net.toLocaleString()} net
          </p>
        </>
      ) : (
        <p className="font-mono font-semibold text-[#f9fafb]">
          {p.net >= 0 ? '+' : ''}{p.net.toLocaleString()} followers
        </p>
      )}
    </div>
  )
}

export default function NetFollowersChart({ snapshots }: { snapshots: Snapshot[] }) {
  const [range, setRange] = useState<Range>(30)

  const { points, hasUnfollows } = useMemo(() => {
    const slice = snapshots
      .filter((s) => s.followers_count != null || s.unfollows != null)
      .slice(0, range)
      .reverse()

    const hasUnfollows = slice.some((s) => s.unfollows != null && s.unfollows > 0)

    const points: ChartPoint[] = slice.map((s) => {
      const follows   = Math.max(0, s.followers_count ?? 0)
      const unfollows = Math.max(0, s.unfollows        ?? 0)
      const net       = hasUnfollows ? follows - unfollows : follows
      return {
        date:      s.date,
        label:     fmtLabel(s.date),
        net,
        follows,
        unfollows,
      }
    })

    return { points, hasUnfollows }
  }, [snapshots, range])

  const hasData = points.length >= 2

  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[#f9fafb]">Net Followers</p>
          <p className="mt-0.5 text-[11px] text-[#6b7280]">
            {hasUnfollows ? 'Daily follows minus unfollows' : 'Daily follower change'}
          </p>
        </div>
        <RangeTabs range={range} onChange={setRange} />
      </div>

      <div style={{ height: 220 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickCount={5}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                {points.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.net >= 0 ? '#2563eb' : '#dc2626'} />
                ))}
              </Bar>
            </BarChart>
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
