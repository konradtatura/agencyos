'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, Loader2, X, Play, Plus, BarChart2, AlertCircle,
  ChevronDown, ChevronUp, Pencil, Trash2, Star,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, LabelList,
  LineChart, Line, Legend,
  PieChart, Pie, Label,
} from 'recharts'
import CreateSequenceModal from './create-sequence-modal'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StoryRow {
  id:            string
  ig_story_id:   string
  media_type:    'IMAGE' | 'VIDEO'
  media_url:     string | null
  thumbnail_url: string | null
  posted_at:     string
  expires_at:    string
  impressions:   number | null
  reach:         number | null
  taps_forward:  number | null
  taps_back:     number | null
  exits:         number | null
  replies:       number | null
  link_clicks:   number | null
  exit_rate:     number | null
}

export interface SequenceRow {
  id:                      string
  name:                    string
  cta_type:                'dm' | 'link' | 'poll' | 'reply' | 'none'
  correlated_dm_count:     number
  created_at:              string
  slide_count:             number
  first_slide_impressions: number | null
  completion_rate:         number | null
  total_replies:           number
}

interface SlideDetail {
  id:           string
  story_id:     string
  slide_order:  number
  is_cta_slide: boolean
  story: {
    id:            string
    thumbnail_url: string | null
    media_url:     string | null
    media_type:    'IMAGE' | 'VIDEO'
    posted_at:     string
    impressions:   number | null
    reach:         number | null
    taps_forward:  number | null
    taps_back:     number | null
    exits:         number | null
    replies:       number | null
    link_clicks:   number | null
    exit_rate:     number | null
  } | null
}

interface SequenceDetail {
  id:                  string
  name:                string
  cta_type:            'dm' | 'link' | 'poll' | 'reply' | 'none'
  correlated_dm_count: number
  created_at:          string
  slides:              SlideDetail[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CTA_CFG = {
  dm:    { label: 'DM',    bg: 'rgba(124,58,237,0.18)',  color: '#a78bfa' },
  link:  { label: 'Link',  bg: 'rgba(37,99,235,0.18)',   color: '#60a5fa' },
  poll:  { label: 'Poll',  bg: 'rgba(5,150,105,0.18)',   color: '#34d399' },
  reply: { label: 'Reply', bg: 'rgba(251,146,60,0.18)',  color: '#fb923c' },
  none:  { label: 'None',  bg: 'rgba(107,114,128,0.18)', color: '#9ca3af' },
}

const TOOLTIP_STYLE = {
  backgroundColor: '#1f2937',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  fontSize: 12,
  color: '#d1d5db',
}

const AXIS_TICK = { fill: '#6b7280', fontSize: 11 }
const GRID_STROKE = 'rgba(255,255,255,0.06)'

// ── CTA badge ──────────────────────────────────────────────────────────────────

function CtaBadge({ type }: { type: keyof typeof CTA_CFG }) {
  const cfg = CTA_CFG[type]
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// ── Story card (compact 160px, 9:16) ──────────────────────────────────────────

function StoryCard({
  story, selected, onClick,
}: {
  story:    StoryRow
  selected: boolean
  onClick:  () => void
}) {
  const thumb   = story.thumbnail_url ?? story.media_url
  const isVideo = story.media_type === 'VIDEO'
  const exitRatePct =
    story.exit_rate != null
      ? story.exit_rate
      : story.exits != null && story.impressions != null && story.impressions > 0
      ? (story.exits / story.impressions) * 100
      : null

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg"
      style={{
        width:           160,
        aspectRatio:     '9 / 16',
        backgroundColor: '#111827',
        border: selected
          ? '2px solid #2563eb'
          : '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}
      onClick={onClick}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <BarChart2 className="h-6 w-6 text-[#374151]" />
        </div>
      )}

      {isVideo && (
        <div className="pointer-events-none absolute left-1.5 top-1.5">
          <div
            className="flex h-4 w-4 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.60)' }}
          >
            <Play className="h-2 w-2 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Always-visible bottom overlay: impressions + exit rate */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-10 transition-opacity duration-200 group-hover:opacity-0"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.82))' }}
      >
        <div className="flex items-end justify-between">
          <div className="flex flex-col items-start">
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/40">Impr</span>
            <span className="text-[11px] font-bold leading-tight text-white" style={{ fontFamily: 'var(--font-mono)' }}>
              {fmtNum(story.impressions)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/40">Exit%</span>
            <span className="text-[11px] font-bold leading-tight text-white" style={{ fontFamily: 'var(--font-mono)' }}>
              {exitRatePct != null ? `${exitRatePct.toFixed(0)}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Hover overlay: all metrics */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-1 px-2.5 py-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ backgroundColor: 'rgba(0,0,0,0.80)' }}
      >
        {[
          { label: 'Impressions', value: fmtNum(story.impressions) },
          { label: 'Reach',       value: fmtNum(story.reach) },
          { label: 'Taps Fwd',   value: fmtNum(story.taps_forward) },
          { label: 'Taps Back',  value: fmtNum(story.taps_back) },
          { label: 'Exits',       value: fmtNum(story.exits) },
          { label: 'Replies',     value: fmtNum(story.replies) },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-1">
            <span className="text-[9px] text-white/50">{label}</span>
            <span className="text-[10px] font-bold text-white" style={{ fontFamily: 'var(--font-mono)' }}>{value}</span>
          </div>
        ))}
        <p className="mt-1 text-center text-[9px] text-white/30">{fmtDateTime(story.posted_at)}</p>
      </div>
    </div>
  )
}

// ── Story detail panel (slide-out on card click) ───────────────────────────────

function StoryDetailPanel({ story, onClose }: { story: StoryRow | null; onClose: () => void }) {
  const [open,         setOpen]         = useState(false)
  const [displayStory, setDisplayStory] = useState<StoryRow | null>(null)

  useEffect(() => {
    if (story) {
      setDisplayStory(story)
      requestAnimationFrame(() => setOpen(true))
    } else {
      setOpen(false)
    }
  }, [story])

  const handleClose = useCallback(() => {
    setOpen(false)
    setTimeout(onClose, 300)
  }, [onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  const s = displayStory
  if (!s) return null

  const thumb = s.thumbnail_url ?? s.media_url
  const exitRateVal =
    s.exit_rate ??
    (s.exits != null && s.impressions != null && s.impressions > 0
      ? (s.exits / s.impressions) * 100
      : null)

  const metrics = [
    { label: 'Impressions',  value: fmtNum(s.impressions) },
    { label: 'Reach',        value: fmtNum(s.reach) },
    { label: 'Taps Forward', value: fmtNum(s.taps_forward) },
    { label: 'Taps Back',    value: fmtNum(s.taps_back) },
    { label: 'Exits',        value: fmtNum(s.exits) },
    { label: 'Replies',      value: fmtNum(s.replies) },
    { label: 'Link Clicks',  value: fmtNum(s.link_clicks) },
    { label: 'Exit Rate',    value: fmtPct(exitRateVal) },
  ]

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={handleClose}
        aria-hidden
      />
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col overflow-y-auto transition-transform duration-300 ease-out"
        style={{
          backgroundColor: '#0f172a',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
        role="dialog" aria-modal="true"
      >
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={
                s.media_type === 'VIDEO'
                  ? { backgroundColor: 'rgba(124,58,237,0.18)', color: '#a78bfa' }
                  : { backgroundColor: 'rgba(37,99,235,0.18)', color: '#60a5fa' }
              }
            >
              {s.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE'}
            </span>
            <span className="text-[13px] text-[#6b7280]">{fmtDateTime(s.posted_at)}</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-[#9ca3af]" />
          </button>
        </div>
        <div className="flex-1 space-y-5 px-5 py-5">
          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {thumb
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumb} alt="" className="w-full object-cover" style={{ maxHeight: 300 }} />
              : (
                <div className="flex h-40 items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <BarChart2 className="h-8 w-8 text-[#4b5563]" />
                </div>
              )
            }
          </div>
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">
              Metrics
            </p>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg px-3 py-3"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">{m.label}</p>
                  <p className="text-[18px] font-bold text-[#f9fafb]" style={{ fontFamily: 'var(--font-mono)' }}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Sequence chart helpers ─────────────────────────────────────────────────────

function ChartTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[12px] font-semibold text-[#9ca3af]">{children}</p>
  )
}

// Block 1 — stat cards

interface StatCardProps {
  label:     string
  value:     string
  highlight?: boolean
}

function StatCard({ label, value, highlight }: StatCardProps) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl px-4 py-3"
      style={{
        backgroundColor: highlight ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${highlight ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: highlight ? '#60a5fa' : '#6b7280' }}>
        {label}
      </p>
      <p
        className="text-[22px] font-bold leading-none"
        style={{ fontFamily: 'var(--font-mono)', color: highlight ? '#93c5fd' : '#f9fafb' }}
      >
        {value}
      </p>
    </div>
  )
}

// Block 2 — drop-off bar chart

interface DropoffTooltipProps {
  active?:  boolean
  payload?: Array<{ payload: { impressions: number; reach: number; exits: number; exitRate: number; name: string } }>
}

function DropoffTooltipContent({ active, payload }: DropoffTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
      <p className="mb-1.5 font-semibold text-[#f9fafb]">{d.name}</p>
      <p>Impressions: <span className="font-mono font-semibold">{fmtNum(d.impressions)}</span></p>
      <p>Reach: <span className="font-mono font-semibold">{fmtNum(d.reach)}</span></p>
      <p>Exits: <span className="font-mono font-semibold">{fmtNum(d.exits)}</span></p>
      <p>Exit Rate: <span className="font-mono font-semibold">{fmtPct(d.exitRate)}</span></p>
    </div>
  )
}

function DropoffChart({ slides }: { slides: SlideDetail[] }) {
  const data = slides.map((s) => {
    const impr = s.story?.impressions ?? 0
    const exits = s.story?.exits ?? 0
    const exitRate =
      s.story?.exit_rate != null
        ? Number(s.story.exit_rate)
        : impr > 0 ? (exits / impr) * 100 : 0

    return {
      name:        `Slide ${s.slide_order}`,
      impressions: impr,
      reach:       s.story?.reach ?? 0,
      exits,
      exitRate,
      is_cta:      s.is_cta_slide,
    }
  })

  return (
    <div>
      <ChartTitle>Slide Drop-off — where people leave</ChartTitle>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip content={<DropoffTooltipContent />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="impressions" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="impressions"
              position="top"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => fmtNum(v as number)}
              style={{ fill: '#9ca3af', fontSize: 10 }}
            />
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.is_cta ? '#2563eb' : '#1e3a5f'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10.5px] text-[#4b5563]">Blue bar = CTA slide</p>
    </div>
  )
}

// Block 3 — exit rate + taps forward line chart

function ExitRateTapsChart({ slides }: { slides: SlideDetail[] }) {
  const data = slides.map((s) => {
    const impr = s.story?.impressions ?? 0
    const er =
      s.story?.exit_rate != null
        ? Number(s.story.exit_rate)
        : impr > 0 ? ((s.story?.exits ?? 0) / impr) * 100 : 0
    const tfr = impr > 0 ? ((s.story?.taps_forward ?? 0) / impr) * 100 : 0

    return {
      name:          `${s.slide_order}`,
      exitRate:      parseFloat(er.toFixed(1)),
      tapsForwardRate: parseFloat(tfr.toFixed(1)),
    }
  })

  return (
    <div>
      <ChartTitle>Engagement Quality — spikes = problem slides</ChartTitle>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: 'rgba(255,255,255,0.08)' }}
            formatter={(v: unknown, name: unknown) => [
              typeof v === 'number' ? `${v.toFixed(1)}%` : String(v),
              name === 'exitRate' ? 'Exit Rate' : 'Taps Fwd Rate',
            ]}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: '#9ca3af', fontSize: 11 }}>
                {value === 'exitRate' ? 'Exit Rate %' : 'Taps Forward Rate %'}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="exitRate"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ fill: '#ef4444', r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="tapsForwardRate"
            stroke="#6b7280"
            strokeWidth={2}
            dot={{ fill: '#6b7280', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Block 4 — engagement donut

function EngagementDonut({
  slides,
  correlatedDms,
}: {
  slides:        SlideDetail[]
  correlatedDms: number
}) {
  const firstImpr    = slides[0]?.story?.impressions ?? 0
  const lastImpr     = slides[slides.length - 1]?.story?.impressions ?? 0
  const totalReplies = slides.reduce((s, sl) => s + (sl.story?.replies ?? 0), 0)

  if (firstImpr === 0) {
    return (
      <div>
        <ChartTitle>Audience Breakdown</ChartTitle>
        <p className="text-[12px] text-[#6b7280]">No impression data yet.</p>
      </div>
    )
  }

  const repliedPct   = (totalReplies / firstImpr) * 100
  const completedPct = Math.max(0, (lastImpr - totalReplies) / firstImpr * 100)
  const droppedPct   = Math.max(0, 100 - repliedPct - completedPct)

  const donutData = [
    { name: 'Replied',   value: parseFloat(repliedPct.toFixed(1)),   color: '#10b981' },
    { name: 'Completed', value: parseFloat(completedPct.toFixed(1)), color: '#2563eb' },
    { name: 'Dropped',   value: parseFloat(droppedPct.toFixed(1)),   color: '#ef4444' },
  ]

  const engagedPct = repliedPct.toFixed(0)

  return (
    <div>
      <ChartTitle>Audience Breakdown</ChartTitle>
      <div className="flex items-center gap-6">
        <PieChart width={180} height={180}>
          <Pie
            data={donutData}
            cx={90} cy={90}
            innerRadius={54} outerRadius={74}
            dataKey="value"
            startAngle={90} endAngle={-270}
            strokeWidth={0}
          >
            {donutData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
            <Label
              content={({ viewBox }) => {
                const vb = viewBox as { cx: number; cy: number }
                return (
                  <g>
                    <text
                      x={vb.cx} y={vb.cy - 7}
                      textAnchor="middle" fill="#f9fafb"
                      fontSize={20} fontWeight="bold"
                    >
                      {engagedPct}%
                    </text>
                    <text
                      x={vb.cx} y={vb.cy + 11}
                      textAnchor="middle" fill="#6b7280"
                      fontSize={11}
                    >
                      engaged
                    </text>
                  </g>
                )
              }}
            />
          </Pie>
        </PieChart>

        <div className="space-y-2">
          {donutData.map((d) => (
            <div key={d.name} className="flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="text-[12px] text-[#9ca3af] w-20">{d.name}</span>
              <span className="font-mono text-[12px] font-semibold text-[#d1d5db]">{d.value.toFixed(1)}%</span>
            </div>
          ))}
          {correlatedDms > 0 && (
            <div className="mt-2 flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: '#a78bfa' }} />
              <span className="text-[12px] text-[#9ca3af] w-20">DMs sent</span>
              <span className="font-mono text-[12px] font-semibold text-[#d1d5db]">{correlatedDms}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Block 5 — skip vs rewind grouped bar chart

function SkipRewindChart({ slides }: { slides: SlideDetail[] }) {
  const data = slides.map((s) => ({
    name:        `${s.slide_order}`,
    tapsForward: s.story?.taps_forward ?? 0,
    tapsBack:    s.story?.taps_back ?? 0,
  }))

  return (
    <div>
      <ChartTitle>Skip vs Rewind — gray = boring slides, blue = interesting slides</ChartTitle>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(v: unknown, name: unknown) => [
              typeof v === 'number' ? fmtNum(v) : String(v),
              name === 'tapsForward' ? 'Taps Forward (skip)' : 'Taps Back (rewind)',
            ]}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: '#9ca3af', fontSize: 11 }}>
                {value === 'tapsForward' ? 'Taps Forward (skip)' : 'Taps Back (rewind)'}
              </span>
            )}
          />
          <Bar dataKey="tapsForward" fill="#374151" radius={[3, 3, 0, 0]} />
          <Bar dataKey="tapsBack"    fill="#2563eb" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Block 6 — slide breakdown table

function SlideTable({ slides }: { slides: SlideDetail[] }) {
  const hasTapsFwd  = slides.some((sl) => sl.story?.taps_forward != null)
  const hasTapsBack = slides.some((sl) => sl.story?.taps_back    != null)
  const hasExits    = slides.some((sl) => sl.story?.exits        != null)

  const headers = [
    '#', 'Thumb', 'Impressions', 'Reach',
    ...(hasTapsFwd  ? ['Taps Fwd']  : []),
    ...(hasTapsBack ? ['Taps Back'] : []),
    ...(hasExits    ? ['Exits']     : []),
    'Exit Rate', 'Replies',
  ]

  return (
    <div>
      <ChartTitle>Slide Breakdown</ChartTitle>
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#6b7280]"
                    style={{ backgroundColor: '#0d1117' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slides.map((slide, i) => {
                const s      = slide.story
                const thumb  = s?.thumbnail_url ?? s?.media_url
                const exitRate =
                  s?.exit_rate != null
                    ? Number(s.exit_rate)
                    : s?.impressions && s.impressions > 0
                    ? ((s.exits ?? 0) / s.impressions) * 100
                    : null
                const isCta  = slide.is_cta_slide

                return (
                  <tr
                    key={slide.id}
                    style={{
                      backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      borderBottom: i < slides.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    <td
                      className="px-3 py-2.5"
                      style={{
                        borderLeft: isCta ? '2.5px solid #2563eb' : '2.5px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#9ca3af]">{slide.slide_order}</span>
                        {isCta && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold tracking-wider"
                            style={{ backgroundColor: 'rgba(37,99,235,0.18)', color: '#60a5fa' }}
                          >
                            <Star className="h-2 w-2" /> CTA
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div
                        className="overflow-hidden rounded"
                        style={{ width: 40, height: 72, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BarChart2 className="h-3 w-3 text-[#374151]" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtNum(s?.impressions)}</td>
                    <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtNum(s?.reach)}</td>
                    {hasTapsFwd  && <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtNum(s?.taps_forward)}</td>}
                    {hasTapsBack && <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtNum(s?.taps_back)}</td>}
                    {hasExits    && <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtNum(s?.exits)}</td>}
                    <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtPct(exitRate)}</td>
                    <td className="px-3 py-2.5 font-mono text-[#d1d5db]">{fmtNum(s?.replies)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[#4b5563]">
        Some metrics only available while stories are live (within 24h of posting).
      </p>
    </div>
  )
}

// ── Sequence accordion item ────────────────────────────────────────────────────

function SequenceAccordionItem({
  seq,
  onDeleted,
  onUpdated,
}: {
  seq:       SequenceRow
  onDeleted: (id: string) => void
  onUpdated: (id: string, name: string, ctaType: string) => void
}) {
  const [open,          setOpen]          = useState(false)
  const [detail,        setDetail]        = useState<SequenceDetail | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [fetchErr,      setFetchErr]      = useState<string | null>(null)
  const [editMode,      setEditMode]      = useState(false)
  const [editName,      setEditName]      = useState('')
  const [editCta,       setEditCta]       = useState<string>('')
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !detail && !loading) {
      setLoading(true)
      setFetchErr(null)
      try {
        const res = await fetch(`/api/stories/sequences/${seq.id}`)
        if (!res.ok) throw new Error('not ok')
        setDetail(await res.json() as SequenceDetail)
      } catch {
        setFetchErr('Failed to load sequence details')
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleSave() {
    if (!editName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/stories/sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, cta_type: editCta }),
      })
      if (!res.ok) throw new Error()
      setDetail((prev) =>
        prev ? { ...prev, name: editName, cta_type: editCta as SequenceDetail['cta_type'] } : prev,
      )
      onUpdated(seq.id, editName, editCta)
      setEditMode(false)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/stories/sequences/${seq.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDeleted(seq.id)
    } catch {
      setDeleting(false)
    }
  }

  // Derived from loaded detail
  const slides        = detail?.slides ?? []
  const firstSlide    = slides[0]
  const lastSlide     = slides[slides.length - 1]
  const firstImpr     = firstSlide?.story?.impressions ?? null
  const lastImpr      = lastSlide?.story?.impressions  ?? null
  const completionRate =
    firstImpr != null && lastImpr != null && firstImpr > 0
      ? (lastImpr / firstImpr) * 100
      : null
  const totalReplies = slides.reduce((s, sl) => s + (sl.story?.replies ?? 0), 0)
  const ctaSlide     = slides.find((s) => s.is_cta_slide)
  const ctaImpr      = ctaSlide?.story?.impressions ?? null
  const ctaReachPct  =
    firstImpr != null && ctaImpr != null && firstImpr > 0
      ? (ctaImpr / firstImpr) * 100
      : null

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ── Collapsed row ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-5 py-4"
        style={{ borderBottom: open ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
      >
        {/* Name / edit input */}
        <div className="min-w-0 flex-1">
          {editMode ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full max-w-xs rounded-lg bg-white/[0.06] px-3 py-1.5 text-[14px] font-semibold text-[#f9fafb] outline-none ring-1 ring-white/10 focus:ring-[#2563eb]"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditMode(false) }}
            />
          ) : (
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-2 text-left"
            >
              <span className="text-[14px] font-semibold text-[#f9fafb]">{seq.name}</span>
              <CtaBadge type={seq.cta_type} />
            </button>
          )}
        </div>

        {/* Quick stats (hidden in edit mode) */}
        {!editMode && (
          <div className="hidden items-center gap-6 sm:flex">
            {[
              { label: 'First Impr.',  value: fmtNum(seq.first_slide_impressions) },
              { label: 'Completion',   value: fmtPct(seq.completion_rate) },
              { label: 'Replies',      value: fmtNum(seq.total_replies || null) },
              { label: 'DMs',          value: String(seq.correlated_dm_count) },
            ].map(({ label, value }) => (
              <div key={label} className="text-right">
                <p className="text-[10px] text-[#6b7280]">{label}</p>
                <p className="text-[12px] font-semibold text-[#d1d5db]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</p>
              </div>
            ))}
            <div className="text-right">
              <p className="text-[10px] text-[#6b7280]">Created</p>
              <p className="text-[11px] text-[#9ca3af]">{fmtDateShort(seq.created_at)}</p>
            </div>
            {seq.slide_count > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-[#6b7280]">Slides</p>
                <p className="text-[12px] font-semibold text-[#d1d5db]" style={{ fontFamily: 'var(--font-mono)' }}>{seq.slide_count}</p>
              </div>
            )}
          </div>
        )}

        {/* CTA type selector (edit mode) */}
        {editMode && (
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(CTA_CFG) as [SequenceRow['cta_type'], typeof CTA_CFG[keyof typeof CTA_CFG]][]).map(
              ([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEditCta(key)}
                  className="rounded px-2.5 py-1 text-[11px] font-bold tracking-wider transition-all"
                  style={
                    editCta === key
                      ? { backgroundColor: cfg.bg, color: cfg.color, outline: `1.5px solid ${cfg.color}` }
                      : { backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280' }
                  }
                >
                  {cfg.label}
                </button>
              ),
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {editMode ? (
            <>
              <button
                type="button"
                onClick={() => { setEditMode(false); setSaveError(null) }}
                disabled={saving}
                className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[#9ca3af] transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa' }}
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditName(detail?.name ?? seq.name); setEditCta(detail?.cta_type ?? seq.cta_type); setSaveError(null); setEditMode(true) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
                aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5 text-[#6b7280]" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true) }}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-[#ef4444]" />
              </button>
              <button
                type="button"
                onClick={toggle}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
                aria-label={open ? 'Collapse' : 'Expand'}
              >
                {open
                  ? <ChevronUp className="h-4 w-4 text-[#9ca3af]" />
                  : <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
                }
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <p className="px-5 pb-2 text-[11.5px] text-[#ef4444]">{saveError}</p>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && !editMode && (
        <div
          className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}
        >
          <p className="text-[12.5px] text-[#fca5a5]">Delete this sequence? This cannot be undone.</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDeleteConfirm(false)}
              disabled={deleting}
              className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[#9ca3af] hover:bg-white/[0.06] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'rgba(239,68,68,0.20)', color: '#f87171' }}
            >
              {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      )}

      {/* ── Expanded content ────────────────────────────────────────────────── */}
      {open && (
        <div className="space-y-8 px-5 py-5">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                />
              ))}
            </div>
          )}

          {fetchErr && !loading && (
            <div
              className="rounded-lg px-4 py-3 text-[12.5px] text-[#fca5a5]"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              {fetchErr}
            </div>
          )}

          {detail && !loading && (
            <>
              {/* Block 1 — 5 stat cards */}
              <div className="grid grid-cols-5 gap-3">
                <StatCard
                  label="First Impressions"
                  value={fmtNum(firstImpr)}
                />
                <StatCard
                  label="Made it to CTA"
                  value={ctaReachPct != null ? `${ctaReachPct.toFixed(1)}%` : '—'}
                  highlight
                />
                <StatCard
                  label="Completion Rate"
                  value={fmtPct(completionRate)}
                />
                <StatCard
                  label="Total Replies"
                  value={fmtNum(totalReplies || null)}
                />
                <StatCard
                  label="Correlated DMs"
                  value={String(detail.correlated_dm_count)}
                />
              </div>

              {/* Block 2 — Drop-off bar chart */}
              <div
                className="rounded-xl p-5"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <DropoffChart slides={slides} />
              </div>

              {/* Block 3 — Exit rate + Taps forward line chart */}
              <div
                className="rounded-xl p-5"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <ExitRateTapsChart slides={slides} />
              </div>

              {/* Block 4 + 5 — Donut & Skip/Rewind side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="rounded-xl p-5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <EngagementDonut slides={slides} correlatedDms={detail.correlated_dm_count} />
                </div>
                <div
                  className="rounded-xl p-5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <SkipRewindChart slides={slides} />
                </div>
              </div>

              {/* Block 6 — Slide breakdown table */}
              <SlideTable slides={slides} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty states ───────────────────────────────────────────────────────────────

function EmptyStories() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl px-6 text-center"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <BarChart2 className="mb-4 h-10 w-10 text-[#374151]" />
      <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">No stories synced yet</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-[#6b7280]">
        Stories are only available for 24 hours. Sync regularly to capture them before they expire.
      </p>
    </div>
  )
}

function EmptySequences({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl px-6 text-center"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <Plus className="mb-4 h-10 w-10 text-[#374151]" />
      <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">No sequences yet</p>
      <p className="mb-5 max-w-sm text-[13px] leading-relaxed text-[#6b7280]">
        Create a sequence to group your story slides and track their performance.
      </p>
      <button
        type="button"
        onClick={onCreateClick}
        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors"
        style={{ backgroundColor: '#2563eb' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1d4ed8' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb' }}
      >
        <Plus className="h-3.5 w-3.5" /> Create Sequence
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  stories:   StoryRow[]
  sequences: SequenceRow[]
}

export default function StoriesView({ stories, sequences: initialSequences }: Props) {
  const router = useRouter()

  const [tab,             setTab]             = useState<'feed' | 'sequences'>('feed')
  const [selectedStory,   setSelectedStory]   = useState<StoryRow | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [localSequences,  setLocalSequences]  = useState<SequenceRow[]>(initialSequences)
  const [syncing,         setSyncing]         = useState(false)
  const [syncError,       setSyncError]       = useState<string | null>(null)

  useEffect(() => { setLocalSequences(initialSequences) }, [initialSequences])

  const handleSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/instagram/stories/sync', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setSyncError(body.error ?? 'Sync failed. Please try again.')
        return
      }
      setTimeout(() => router.refresh(), 400)
    } catch {
      setSyncError('Network error. Please try again.')
    } finally {
      setSyncing(false)
    }
  }, [syncing, router])

  function handleSequenceCreated(id: string) {
    setCreateModalOpen(false)
    router.refresh()
  }

  function handleSequenceDeleted(id: string) {
    setLocalSequences((prev) => prev.filter((s) => s.id !== id))
  }

  function handleSequenceUpdated(id: string, name: string, ctaType: string) {
    setLocalSequences((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name, cta_type: ctaType as SequenceRow['cta_type'] } : s,
      ),
    )
  }

  return (
    <div>
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {([
            { key: 'feed',      label: 'Story Feed' },
            { key: 'sequences', label: 'Sequences' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-all"
              style={tab === key ? { backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa' } : { color: '#6b7280' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {syncError && (
            <span className="flex items-center gap-1.5 text-[12px] text-[#f87171]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {syncError}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.20)' }}
            onMouseEnter={(e) => { if (!syncing) e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.20)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.12)' }}
          >
            {syncing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…</>
              : <><RefreshCw className="h-3.5 w-3.5" /> Sync Now</>
            }
          </button>
        </div>
      </div>

      {/* ── Story Feed tab ─────────────────────────────────────────────────── */}
      {tab === 'feed' && (
        stories.length === 0
          ? <EmptyStories />
          : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, 160px)',
                gap: 12,
              }}
            >
              {stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  selected={selectedStory?.id === story.id}
                  onClick={() => setSelectedStory((prev) => (prev?.id === story.id ? null : story))}
                />
              ))}
            </div>
          )
      )}

      {/* ── Sequences tab ──────────────────────────────────────────────────── */}
      {tab === 'sequences' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] text-[#6b7280]">
              {localSequences.length} sequence{localSequences.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.20)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.20)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.12)' }}
            >
              <Plus className="h-3.5 w-3.5" /> Create Sequence
            </button>
          </div>

          {localSequences.length === 0
            ? <EmptySequences onCreateClick={() => setCreateModalOpen(true)} />
            : (
              <div className="space-y-3">
                {localSequences.map((seq) => (
                  <SequenceAccordionItem
                    key={seq.id}
                    seq={seq}
                    onDeleted={handleSequenceDeleted}
                    onUpdated={handleSequenceUpdated}
                  />
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* ── Story detail slide-out panel ──────────────────────────────────── */}
      <StoryDetailPanel story={selectedStory} onClose={() => setSelectedStory(null)} />

      {/* ── Create sequence modal ─────────────────────────────────────────── */}
      <CreateSequenceModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        stories={stories}
        onCreated={handleSequenceCreated}
      />
    </div>
  )
}
