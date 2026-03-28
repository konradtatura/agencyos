'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, X, Play, Plus, BarChart2, AlertCircle } from 'lucide-react'
import CreateSequenceModal from './create-sequence-modal'
import SequenceDetailPanel from './sequence-detail-panel'

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

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

function fmtPct(n: number | null): string {
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

// ── Metric tile ────────────────────────────────────────────────────────────────

function MetricTile({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      title={tooltip}
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: tooltip ? 'help' : undefined,
      }}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">{label}</p>
      <p className="text-[18px] font-bold text-[#f9fafb]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</p>
    </div>
  )
}

// ── Story card (feed grid) ─────────────────────────────────────────────────────

function StoryCard({
  story, selected, onClick,
}: {
  story:    StoryRow
  selected: boolean
  onClick:  () => void
}) {
  const thumb   = story.thumbnail_url ?? story.media_url
  const isVideo = story.media_type === 'VIDEO'

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl transition-transform duration-150 hover:scale-[1.01]"
      style={{
        aspectRatio:     '9 / 16',
        backgroundColor: '#111827',
        border: selected
          ? '2px solid #2563eb'
          : '1px solid rgba(255,255,255,0.08)',
      }}
      onClick={onClick}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <BarChart2 className="h-8 w-8 text-[#374151]" />
        </div>
      )}

      {isVideo && (
        <div className="pointer-events-none absolute left-2 top-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.60)' }}>
            <Play className="h-2.5 w-2.5 fill-white text-white" />
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 px-2 pb-2 pt-6"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.72))' }}
      >
        <p className="text-[11px] font-medium text-white/75">{fmtDateTime(story.posted_at)}</p>
      </div>

      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}
      >
        <div className="grid w-full grid-cols-2 gap-1.5">
          {[
            { label: 'Impr.',   value: fmtNum(story.impressions) },
            { label: 'Reach',   value: fmtNum(story.reach) },
            { label: 'Exits',   value: fmtNum(story.exits) },
            { label: 'Replies', value: fmtNum(story.replies) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg px-2 py-1.5 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
              <p className="text-[13px] font-bold text-white" style={{ fontFamily: 'var(--font-mono)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Story detail panel ─────────────────────────────────────────────────────────

function StoryDetailPanel({ story, onClose }: { story: StoryRow | null; onClose: () => void }) {
  const [open,         setOpen]         = useState(false)
  const [displayStory, setDisplayStory] = useState<StoryRow | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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
  const exitRateVal = s.exit_rate ?? (
    s.exits != null && s.impressions != null && s.impressions > 0
      ? (s.exits / s.impressions) * 100
      : null
  )

  const metrics = [
    { label: 'Impressions',  value: fmtNum(s.impressions) },
    { label: 'Reach',        value: fmtNum(s.reach) },
    { label: 'Taps Forward', value: fmtNum(s.taps_forward) },
    { label: 'Taps Back',    value: fmtNum(s.taps_back) },
    { label: 'Exits',        value: fmtNum(s.exits) },
    { label: 'Replies',      value: fmtNum(s.replies) },
    { label: 'Link Clicks',  value: fmtNum(s.link_clicks) },
    { label: 'Exit Rate', value: fmtPct(exitRateVal), tooltip: 'Exits ÷ Impressions × 100. The % of viewers who swiped away.' },
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
        ref={panelRef}
        className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col overflow-y-auto transition-transform duration-300 ease-out"
        style={{ backgroundColor: '#0f172a', borderLeft: '1px solid rgba(255,255,255,0.08)', transform: open ? 'translateX(0)' : 'translateX(100%)' }}
        role="dialog" aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              style={s.media_type === 'VIDEO' ? { backgroundColor: 'rgba(124,58,237,0.18)', color: '#a78bfa' } : { backgroundColor: 'rgba(37,99,235,0.18)', color: '#60a5fa' }}>
              {s.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE'}
            </span>
            <span className="text-[13px] text-[#6b7280]">{fmtDateTime(s.posted_at)}</span>
          </div>
          <button type="button" onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]" aria-label="Close">
            <X className="h-4 w-4 text-[#9ca3af]" />
          </button>
        </div>
        <div className="flex-1 space-y-5 px-5 py-5">
          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {thumb
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumb} alt="" className="w-full object-cover" style={{ maxHeight: 300 }} />
              : <div className="flex h-40 items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}><BarChart2 className="h-8 w-8 text-[#4b5563]" /></div>
            }
          </div>
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">Metrics</p>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m) => <MetricTile key={m.label} {...m} />)}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── CTA badge ──────────────────────────────────────────────────────────────────

function CtaBadge({ type }: { type: SequenceRow['cta_type'] }) {
  const cfg = {
    dm:    { label: 'DM',    bg: 'rgba(124,58,237,0.18)', color: '#a78bfa' },
    link:  { label: 'Link',  bg: 'rgba(37,99,235,0.18)',  color: '#60a5fa' },
    poll:  { label: 'Poll',  bg: 'rgba(5,150,105,0.18)',  color: '#34d399' },
    reply: { label: 'Reply', bg: 'rgba(251,146,60,0.18)', color: '#fb923c' },
    none:  { label: 'None',  bg: 'rgba(107,114,128,0.18)', color: '#9ca3af' },
  }[type]
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ── Sequence card ──────────────────────────────────────────────────────────────

function SequenceCard({ seq, onClick }: { seq: SequenceRow; onClick: () => void }) {
  const stats = [
    { label: 'First Impr.',    value: fmtNum(seq.first_slide_impressions) },
    { label: 'Completion',     value: fmtPct(seq.completion_rate) },
    { label: 'Total Replies',  value: fmtNum(seq.total_replies || null) },
    { label: 'Correlated DMs', value: String(seq.correlated_dm_count) },
  ]

  return (
    <div
      className="cursor-pointer rounded-xl px-5 py-4 transition-colors"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-[#f9fafb]">{seq.name}</p>
            <CtaBadge type={seq.cta_type} />
          </div>
          <p className="mt-0.5 text-[12px] text-[#6b7280]">
            Created {fmtDateShort(seq.created_at)}
            {seq.slide_count > 0 && <> · <span className="text-[#9ca3af]">{seq.slide_count} slide{seq.slide_count !== 1 ? 's' : ''}</span></>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-6">
          {stats.map(({ label, value }) => (
            <div key={label} className="text-right">
              <p className="text-[11px] text-[#6b7280]">{label}</p>
              <p className="text-[13px] font-semibold text-[#d1d5db]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Empty states ───────────────────────────────────────────────────────────────

function EmptyStories() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl px-6 text-center"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
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
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl px-6 text-center"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
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

  const [tab,              setTab]            = useState<'feed' | 'sequences'>('feed')
  const [selectedStory,    setSelectedStory]  = useState<StoryRow | null>(null)
  const [selectedSeqId,    setSelectedSeqId]  = useState<string | null>(null)
  const [createModalOpen,  setCreateModalOpen] = useState(false)
  const [localSequences,   setLocalSequences] = useState<SequenceRow[]>(initialSequences)
  const [syncing,          setSyncing]        = useState(false)
  const [syncError,        setSyncError]      = useState<string | null>(null)

  // Keep localSequences in sync when server re-renders with new data
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

  // Called after a sequence is created — refresh server data to get full row
  function handleSequenceCreated(id: string) {
    setCreateModalOpen(false)
    router.refresh()
    // Open the detail panel for the new sequence after a brief delay
    setTimeout(() => setSelectedSeqId(id), 300)
  }

  // Called after a sequence is deleted from the detail panel
  function handleSequenceDeleted(id: string) {
    setSelectedSeqId(null)
    setLocalSequences((prev) => prev.filter((s) => s.id !== id))
  }

  // Called after name/CTA type is edited in the detail panel
  function handleSequenceUpdated(id: string, name: string, ctaType: string) {
    setLocalSequences((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name, cta_type: ctaType as SequenceRow['cta_type'] } : s,
      ),
    )
  }

  return (
    <div>
      {/* ── Top bar: tabs + sync ────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([{ key: 'feed', label: 'Story Feed' }, { key: 'sequences', label: 'Sequences' }] as const).map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-all"
              style={tab === key ? { backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa' } : { color: '#6b7280' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {syncError && (
            <span className="flex items-center gap-1.5 text-[12px] text-[#f87171]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{syncError}
            </span>
          )}
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.20)' }}
            onMouseEnter={(e) => { if (!syncing) e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.20)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.12)' }}>
            {syncing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…</> : <><RefreshCw className="h-3.5 w-3.5" /> Sync Now</>}
          </button>
        </div>
      </div>

      {/* ── Story Feed tab ──────────────────────────────────────────────────── */}
      {tab === 'feed' && (
        stories.length === 0
          ? <EmptyStories />
          : (
            <div className="grid grid-cols-3 gap-4">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} selected={selectedStory?.id === story.id}
                  onClick={() => setSelectedStory((prev) => (prev?.id === story.id ? null : story))} />
              ))}
            </div>
          )
      )}

      {/* ── Sequences tab ───────────────────────────────────────────────────── */}
      {tab === 'sequences' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] text-[#6b7280]">
              {localSequences.length} sequence{localSequences.length !== 1 ? 's' : ''}
            </p>
            <button type="button" onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.20)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.20)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.12)' }}>
              <Plus className="h-3.5 w-3.5" /> Create Sequence
            </button>
          </div>

          {localSequences.length === 0
            ? <EmptySequences onCreateClick={() => setCreateModalOpen(true)} />
            : (
              <div className="space-y-3">
                {localSequences.map((seq) => (
                  <SequenceCard key={seq.id} seq={seq} onClick={() => setSelectedSeqId(seq.id)} />
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* ── Overlays ────────────────────────────────────────────────────────── */}
      <StoryDetailPanel story={selectedStory} onClose={() => setSelectedStory(null)} />

      <SequenceDetailPanel
        sequenceId={selectedSeqId}
        onClose={() => setSelectedSeqId(null)}
        onDeleted={handleSequenceDeleted}
        onUpdated={handleSequenceUpdated}
      />

      <CreateSequenceModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        stories={stories}
        onCreated={handleSequenceCreated}
      />
    </div>
  )
}
