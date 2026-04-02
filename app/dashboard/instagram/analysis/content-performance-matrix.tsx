'use client'

import { useState, useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import PostDetailPanel from '../content/post-detail-panel'
import {
  type PostRow,
  type AccountAverages,
  calcEngagementRate,
  computeAverages,
} from '../content/posts-table'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MatrixPoint {
  id:        string
  reach:     number
  engRate:   number
  saved:     number
  mediaType: PostRow['media_type']
  post:      PostRow
}

type MediaFilter = 'ALL' | 'VIDEO' | 'IMAGE' | 'CAROUSEL_ALBUM'
type DateRange   = '7d'  | '30d'  | '90d'  | 'all'

interface Props {
  rows: PostRow[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DOT_COLOR: Record<PostRow['media_type'], string> = {
  VIDEO:          '#3b82f6',
  IMAGE:          '#6b7280',
  CAROUSEL_ALBUM: '#14b8a6',
}

const MEDIA_LABEL: Record<PostRow['media_type'], string> = {
  VIDEO:          'Reels',
  IMAGE:          'Images',
  CAROUSEL_ALBUM: 'Carousels',
}

const MIN_R = 6
const MAX_R = 20

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function dotRadius(saved: number, minSaved: number, maxSaved: number): number {
  if (maxSaved === minSaved) return (MIN_R + MAX_R) / 2
  const t = (saved - minSaved) / (maxSaved - minSaved)
  return MIN_R + t * (MAX_R - MIN_R)
}

// ── Custom dot shape ───────────────────────────────────────────────────────────

function makeDotShape(
  minSaved: number,
  maxSaved: number,
  onClickPost: (post: PostRow) => void,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function DotShape(props: any) {
    const { cx, cy, payload } = props as { cx: number; cy: number; payload: MatrixPoint }
    if (cx == null || cy == null) return null
    const r     = dotRadius(payload.saved, minSaved, maxSaved)
    const color = DOT_COLOR[payload.mediaType]
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        fillOpacity={0.7}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.9}
        style={{ cursor: 'pointer' }}
        onClick={() => onClickPost(payload.post)}
      />
    )
  }
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as MatrixPoint
  if (!point) return null
  const color = DOT_COLOR[point.mediaType]
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[12.5px] shadow-xl"
      style={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 220 }}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
        {MEDIA_LABEL[point.mediaType]}
      </p>
      {point.post.caption && (
        <p className="mb-2 text-[12px] leading-snug text-[#9ca3af]" style={{ maxWidth: 180 }}>
          {point.post.caption.length > 60 ? point.post.caption.slice(0, 60) + '…' : point.post.caption}
        </p>
      )}
      <p className="text-[11px] text-[#6b7280]">{fmtDate(point.post.posted_at)}</p>
      <div className="mt-2 space-y-0.5 border-t border-white/[0.06] pt-2">
        <div className="flex justify-between gap-4">
          <span className="text-[#6b7280]">Reach</span>
          <span className="font-mono font-semibold text-[#f9fafb]">{fmtK(point.reach)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#6b7280]">Eng. rate</span>
          <span className="font-mono font-semibold text-[#f9fafb]">{point.engRate.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#6b7280]">Saves</span>
          <span className="font-mono font-semibold text-[#f9fafb]">{fmtK(point.saved)}</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[#4b5563]">Click to open details</p>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all"
      style={active
        ? { backgroundColor: 'rgba(37,99,235,0.25)', color: '#60a5fa' }
        : { color: '#6b7280' }}
    >
      {children}
    </button>
  )
}

// ── Quadrant label config factory ─────────────────────────────────────────────

function quadrantLabel(text: string, position: string) {
  return {
    value:      text,
    position,
    fill:       '#374151',
    fontSize:   11,
    fontWeight: 600,
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ContentPerformanceMatrix({ rows }: Props) {
  const [filter,       setFilter]       = useState<MediaFilter>('ALL')
  const [dateRange,    setDateRange]    = useState<DateRange>('all')
  const [selectedPost, setSelectedPost] = useState<PostRow | null>(null)

  // Averages computed from all posts (not filtered) for the detail panel comparisons
  const averages = useMemo<AccountAverages>(() => computeAverages(rows), [rows])

  // Apply filters
  const filteredRows = useMemo(() => {
    let r = rows
    if (filter !== 'ALL') r = r.filter((p) => p.media_type === filter)
    if (dateRange !== 'all') {
      const days   = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      r = r.filter((p) => new Date(p.posted_at).getTime() >= cutoff)
    }
    return r
  }, [rows, filter, dateRange])

  // Build scatter points (only posts that have reach data)
  const points = useMemo<MatrixPoint[]>(() => {
    return filteredRows
      .filter((r) => r.reach != null && r.reach > 0)
      .map((r) => ({
        id:        r.id,
        reach:     r.reach as number,
        engRate:   calcEngagementRate(r) ?? 0,
        saved:     r.saved ?? 0,
        mediaType: r.media_type,
        post:      r,
      }))
  }, [filteredRows])

  // Stats: medians, domain bounds, saved range for dot sizing
  const stats = useMemo(() => {
    if (!points.length) {
      return { medianReach: 0, medianEngRate: 0, minSaved: 0, maxSaved: 0, xMax: 100, yMax: 10 }
    }
    const sortedReach = [...points.map((p) => p.reach)].sort((a, b) => a - b)
    const sortedEng   = [...points.map((p) => p.engRate)].sort((a, b) => a - b)
    const savedVals   = points.map((p) => p.saved)

    const xMax = sortedReach[sortedReach.length - 1] * 1.12
    const yMax = Math.max(sortedEng[sortedEng.length - 1] * 1.2, 1)

    return {
      medianReach:   median(sortedReach),
      medianEngRate: median(sortedEng),
      minSaved:      Math.min(...savedVals),
      maxSaved:      Math.max(...savedVals),
      xMax,
      yMax,
    }
  }, [points])

  const dotShape = useMemo(
    () => makeDotShape(stats.minSaved, stats.maxSaved, setSelectedPost),
    [stats.minSaved, stats.maxSaved],
  )

  const hasData = points.length > 0

  return (
    <>
      <div
        className="rounded-xl px-5 py-5"
        style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-[#f9fafb]">Content Performance Matrix</p>
            <p className="mt-0.5 text-[11px] text-[#6b7280]">
              {points.length} post{points.length !== 1 ? 's' : ''} plotted
              {filter !== 'ALL' ? ` · ${MEDIA_LABEL[filter as PostRow['media_type']]} only` : ''}
            </p>
          </div>

          {/* Custom legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#9ca3af]">
            {(['VIDEO', 'IMAGE', 'CAROUSEL_ALBUM'] as PostRow['media_type'][]).map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: DOT_COLOR[t] }}
                />
                {MEDIA_LABEL[t]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[#6b7280]">
              <span className="flex items-end gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#6b7280]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#6b7280] opacity-50" />
              </span>
              Dot size = saves
            </span>
          </div>
        </div>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Media type filter */}
          <div
            className="flex items-center gap-0.5 rounded-lg p-0.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            {(['ALL', 'VIDEO', 'IMAGE', 'CAROUSEL_ALBUM'] as MediaFilter[]).map((f) => (
              <TabBtn key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === 'ALL' ? 'All' : MEDIA_LABEL[f as PostRow['media_type']]}
              </TabBtn>
            ))}
          </div>

          {/* Date range */}
          <div
            className="flex items-center gap-0.5 rounded-lg p-0.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            {(['7d', '30d', '90d', 'all'] as DateRange[]).map((r) => (
              <TabBtn key={r} active={dateRange === r} onClick={() => setDateRange(r)}>
                {r === 'all' ? 'All time' : r.toUpperCase()}
              </TabBtn>
            ))}
          </div>
        </div>

        {/* ── Chart ───────────────────────────────────────────────────────── */}
        <div style={{ height: 420 }}>
          {!hasData ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-[13px]" style={{ color: '#4b5563' }}>
                No posts with reach data match the current filters.<br />
                Try a wider date range or sync your content library.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                />

                <XAxis
                  type="number"
                  dataKey="reach"
                  name="Reach"
                  domain={[0, stats.xMax]}
                  tickFormatter={fmtK}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Reach', position: 'insideBottom', offset: -8, fill: '#4b5563', fontSize: 11 }}
                />

                <YAxis
                  type="number"
                  dataKey="engRate"
                  name="Eng. Rate"
                  domain={[0, stats.yMax]}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  label={{ value: 'Engagement rate', angle: -90, position: 'insideLeft', offset: 8, fill: '#4b5563', fontSize: 11 }}
                />

                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.06)' }}
                />

                {/* ── Quadrant areas (transparent fill, labels only) ───── */}
                <ReferenceArea
                  x1={0}                   x2={stats.medianReach}
                  y1={0}                   y2={stats.medianEngRate}
                  fill="transparent"       stroke="none"
                  label={quadrantLabel('Cut These', 'insideBottomLeft')}
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  x1={0}                   x2={stats.medianReach}
                  y1={stats.medianEngRate} y2={stats.yMax}
                  fill="transparent"       stroke="none"
                  label={quadrantLabel('Hidden Gems', 'insideTopLeft')}
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  x1={stats.medianReach}   x2={stats.xMax}
                  y1={0}                   y2={stats.medianEngRate}
                  fill="transparent"       stroke="none"
                  label={quadrantLabel('Hollow Reach', 'insideBottomRight')}
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  x1={stats.medianReach}   x2={stats.xMax}
                  y1={stats.medianEngRate} y2={stats.yMax}
                  fill="transparent"       stroke="none"
                  label={quadrantLabel('Winners', 'insideTopRight')}
                  ifOverflow="extendDomain"
                />

                {/* ── Median reference lines ────────────────────────────── */}
                <ReferenceLine
                  x={stats.medianReach}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{
                    value:    `med ${fmtK(stats.medianReach)}`,
                    position: 'top',
                    fill:     '#4b5563',
                    fontSize: 10,
                    dy:       -4,
                  }}
                />
                <ReferenceLine
                  y={stats.medianEngRate}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{
                    value:    `med ${stats.medianEngRate.toFixed(1)}%`,
                    position: 'right',
                    fill:     '#4b5563',
                    fontSize: 10,
                    dx:       4,
                  }}
                />

                {/* ── Scatter dots ─────────────────────────────────────── */}
                <Scatter data={points} shape={dotShape} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Footer note ─────────────────────────────────────────────────── */}
        {hasData && (
          <p className="mt-3 text-[11px] text-[#4b5563]">
            Dashed lines = median reach & engagement rate across plotted posts.
            Quadrants help identify which content to double down on vs cut.
          </p>
        )}
      </div>

      {/* ── Post detail panel ────────────────────────────────────────────── */}
      {selectedPost && (
        <PostDetailPanel
          post={selectedPost}
          averages={averages}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </>
  )
}
