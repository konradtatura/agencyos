'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ExternalLink, Play, Loader2, Copy, Check, Save } from 'lucide-react'
import type { ManualMetricField } from '@/app/api/instagram/posts/manual-metrics/route'
import type { PostRow, AccountAverages } from './posts-table'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  post:                PostRow
  averages:            AccountAverages
  onClose:             () => void
  initialTranscript?:  string | null
  scrollToTranscript?: boolean
  onTranscribeStart?:  (postId: string) => void
  onTranscribed?:      (postId: string) => void
  onTranscribeFailed?: (postId: string) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTotalWatchTime(ms: number | null): string {
  if (ms == null) return '—'
  const seconds = ms / 1000
  const hours   = seconds / 3600
  const minutes = seconds / 60
  if (hours   >= 1) return `${hours.toFixed(1)}h`
  if (minutes >= 1) return `${Math.round(minutes)}m`
  return `${Math.round(seconds)}s`
}

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

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function vsAvg(value: number | null, avg: number | null): { label: string; color: string } | null {
  if (value == null || avg == null || avg === 0) return null
  const ratio = value / avg
  const label = `${ratio.toFixed(1)}× avg`
  if (ratio >= 1.2) return { label, color: '#34d399' }
  if (ratio <= 0.8) return { label, color: '#f87171' }
  return { label: '≈ avg', color: '#6b7280' }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: PostRow['media_type'] }) {
  const cfg = {
    VIDEO:          { label: 'REEL',     bg: 'rgba(124,58,237,0.18)', color: '#a78bfa' },
    IMAGE:          { label: 'IMAGE',    bg: 'rgba(37,99,235,0.18)',  color: '#60a5fa' },
    CAROUSEL_ALBUM: { label: 'CAROUSEL', bg: 'rgba(5,150,105,0.18)',  color: '#34d399' },
  }[type]
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function MetricTile({
  label, value, compare, tooltip,
}: {
  label:    string
  value:    string
  compare:  ReturnType<typeof vsAvg>
  tooltip?: string
}) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      title={tooltip}
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: tooltip ? 'help' : undefined }}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">{label}</p>
      <p className="text-[18px] font-bold text-[#f9fafb]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</p>
      {compare && (
        <p className="mt-0.5 text-[11px] font-medium" style={{ color: compare.color }}>
          {compare.label}
        </p>
      )}
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function PostDetailPanel({
  post,
  averages,
  onClose,
  initialTranscript = null,
  scrollToTranscript = false,
  onTranscribeStart,
  onTranscribed,
  onTranscribeFailed,
}: Props) {
  const [open,             setOpen]             = useState(false)
  const [transcribing,     setTranscribing]     = useState(false)
  const [localStatus,      setLocalStatus]      = useState(post.transcript_status)
  const [localTranscript,  setLocalTranscript]  = useState<string | null>(initialTranscript)
  const [transcribedAt,    setTranscribedAt]    = useState<Date | null>(null)
  const [transcribeError,  setTranscribeError]  = useState<string | null>(null)
  const [copied,           setCopied]           = useState(false)

  // Manual metric inputs
  const [watchTimeInput, setWatchTimeInput] = useState(post.avg_watch_time_ms != null ? String((post.avg_watch_time_ms / 1000).toFixed(1)) : '')
  const [manualSaving,   setManualSaving]   = useState<ManualMetricField | null>(null)
  const [manualSaved,    setManualSaved]    = useState<ManualMetricField | null>(null)

  const panelRef        = useRef<HTMLDivElement>(null)
  const transcriptRef   = useRef<HTMLDivElement>(null)
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Slide-in on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // ── Escape to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Scroll to transcript when opened via green dot ───────────────────────────
  useEffect(() => {
    if (!scrollToTranscript || localStatus !== 'done') return
    const id = setTimeout(() => {
      transcriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 320) // after slide-in animation
    return () => clearTimeout(id)
  }, [scrollToTranscript, localStatus])

  // ── Poll while processing ────────────────────────────────────────────────────
  useEffect(() => {
    if (localStatus !== 'processing') return

    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/instagram/transcribe/status?postId=${post.id}`)
        const data = await res.json()

        if (data.status === 'done') {
          clearInterval(pollRef.current!)
          setLocalStatus('done')
          setLocalTranscript(data.transcript)
          setTranscribedAt(new Date())
          onTranscribed?.(post.id)
        } else if (data.status === 'none') {
          // Server reset it — transcription failed
          clearInterval(pollRef.current!)
          setLocalStatus('none')
          setTranscribeError('Transcription failed. Try again.')
          setTranscribing(false)
          onTranscribeFailed?.(post.id)
        }
      } catch {
        // Network blip — keep polling
      }
    }, 3_000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [localStatus, post.id, onTranscribed, onTranscribeFailed])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSaveManual(field: ManualMetricField, rawValue: string) {
    const parsed = parseFloat(rawValue)
    if (isNaN(parsed) || parsed < 0) return
    // avg_watch_time_ms is stored in ms; user inputs seconds
    const value = field === 'avg_watch_time_ms' ? Math.round(parsed * 1000) : parsed

    setManualSaving(field)
    setManualSaved(null)
    try {
      const res = await fetch('/api/instagram/posts/manual-metrics', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ post_id: post.id, field, value }),
      })
      if (res.ok) {
        setManualSaved(field)
        setTimeout(() => setManualSaved(null), 2000)
      }
    } finally {
      setManualSaving(null)
    }
  }

  function handleClose() {
    setOpen(false)
    if (pollRef.current) clearInterval(pollRef.current)
    setTimeout(onClose, 280)
  }

  async function handleTranscribe() {
    if (transcribing) return
    setTranscribing(true)
    setTranscribeError(null)
    setLocalStatus('processing')
    onTranscribeStart?.(post.id)

    try {
      const res  = await fetch('/api/instagram/transcribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId: post.id }),
      })
      const data = await res.json()

      if (!res.ok) {
        setLocalStatus('none')
        setTranscribeError(data.error ?? 'Transcription failed. Try again.')
        onTranscribeFailed?.(post.id)
      } else {
        setLocalStatus('done')
        setLocalTranscript(data.transcript)
        setTranscribedAt(new Date())
        onTranscribed?.(post.id)
      }
    } catch {
      setLocalStatus('none')
      setTranscribeError('Transcription failed. Try again.')
      onTranscribeFailed?.(post.id)
    } finally {
      setTranscribing(false)
    }
  }

  function handleCopy() {
    if (!localTranscript) return
    navigator.clipboard.writeText(localTranscript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Derived metrics ───────────────────────────────────────────────────────────

  const isReel      = post.media_type === 'VIDEO'
  const thumb       = post.thumbnail_url ?? post.media_url
  const engRate   = post.reach ? ((post.like_count ?? 0) + (post.comments_count ?? 0) + (post.saved ?? 0) + (post.shares ?? 0)) / post.reach * 100 : null
  const saveRate  = post.reach && post.saved  != null ? post.saved  / post.reach * 100 : null
  const shareRate = post.reach && post.shares != null ? post.shares / post.reach * 100 : null

  // avg_watch_time_ms stores milliseconds; convert to seconds for display
  const avgWatchSec = post.avg_watch_time_ms != null ? `${(post.avg_watch_time_ms / 1000).toFixed(1)}s` : '—'

  const metrics = [
    ...(isReel ? [{ label: 'Views',       value: fmtNum(post.views),        compare: vsAvg(post.views,         averages.views)           }] : []),
    { label: 'Reach',      value: fmtNum(post.reach),            compare: vsAvg(post.reach,          averages.reach)          },
    { label: 'Likes',      value: fmtNum(post.like_count),       compare: vsAvg(post.like_count,     averages.like_count)     },
    { label: 'Comments',   value: fmtNum(post.comments_count),   compare: vsAvg(post.comments_count, averages.comments_count) },
    { label: 'Saves',      value: fmtNum(post.saved),            compare: vsAvg(post.saved,          averages.saved)          },
    { label: 'Shares',     value: fmtNum(post.shares),           compare: vsAvg(post.shares,         averages.shares)         },
    { label: 'Eng. Rate',  value: fmtPct(engRate),               compare: vsAvg(engRate,             averages.engagement_rate) },
    { label: 'Save Rate',  value: fmtPct(saveRate),              compare: vsAvg(saveRate,            averages.save_rate)       },
    { label: 'Share Rate', value: fmtPct(shareRate),             compare: vsAvg(shareRate,           averages.share_rate)      },
    ...(isReel ? [
      { label: 'Avg Watch',    value: avgWatchSec,                         compare: vsAvg(post.avg_watch_time_ms, averages.avg_watch_time_ms) },
      { label: 'Total Watch',  value: fmtTotalWatchTime(post.total_watch_time_ms), compare: null },
    ] : [
      { label: 'Follows',      value: fmtNum(post.follows_count),          compare: vsAvg(post.follows_count, averages.follows_count) },
    ]),
  ]

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={handleClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-full flex-col overflow-y-auto transition-transform duration-300 ease-out"
        style={{
          backgroundColor: '#0f172a',
          borderLeft:       '1px solid rgba(255,255,255,0.08)',
          transform:        open ? 'translateX(0)' : 'translateX(100%)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <TypeBadge type={post.media_type} />
            <span className="text-[13px] text-[#6b7280]">{fmtDateLong(post.posted_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
                title="Open on Instagram"
              >
                <ExternalLink className="h-4 w-4 text-[#9ca3af]" />
              </a>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
              aria-label="Close panel"
            >
              <X className="h-4 w-4 text-[#9ca3af]" />
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-6 px-5 py-5">

          {/* Thumbnail */}
          <div className="relative w-full overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="w-full object-cover" style={{ maxHeight: 320 }} />
            ) : (
              <div className="flex h-48 w-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <span className="text-[13px] text-[#4b5563]">No thumbnail</span>
              </div>
            )}
            {isReel && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
                  <Play className="h-5 w-5 fill-white text-white" />
                </div>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">Caption</p>
            {post.caption
              ? <p className="text-[14px] leading-relaxed text-[#d1d5db]">{post.caption}</p>
              : <p className="text-[14px] italic text-[#4b5563]">No caption</p>
            }
          </div>

          {/* Metrics */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">Metrics</p>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m) => <MetricTile key={m.label} {...m} />)}
            </div>
          </div>

          {/* Manual Metrics — reels only */}
          {isReel && (
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">Manual Metrics</p>
              <div
                className="rounded-xl px-4 py-4 space-y-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-[11px] text-[#4b5563]">
                  Enter values that aren&apos;t available via the API for your account size.
                </p>

                {/* Avg Watch Time */}
                <div className="flex items-center gap-2">
                  <label className="w-[110px] shrink-0 text-[12px] text-[#9ca3af]">Avg Watch Time</label>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={watchTimeInput}
                      onChange={(e) => setWatchTimeInput(e.target.value)}
                      placeholder="e.g. 8.4"
                      className="w-full rounded-md px-2.5 py-1.5 pr-10 text-[12px] text-[#f9fafb] outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#6b7280]">sec</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveManual('avg_watch_time_ms', watchTimeInput)}
                    disabled={manualSaving === 'avg_watch_time_ms' || watchTimeInput === ''}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ backgroundColor: manualSaved === 'avg_watch_time_ms' ? 'rgba(52,211,153,0.15)' : 'rgba(37,99,235,0.2)', color: manualSaved === 'avg_watch_time_ms' ? '#34d399' : '#60a5fa' }}
                  >
                    {manualSaved === 'avg_watch_time_ms' ? <><Check className="h-3 w-3" /> Saved</> : <><Save className="h-3 w-3" /> Save</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transcript — reels only */}
          {isReel && (
            <div ref={transcriptRef}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">Transcript</p>

              {/* ── Not started ─────────────────────────────────────────── */}
              {localStatus === 'none' && (
                <div
                  className="flex flex-col items-start gap-3 rounded-xl p-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[13px] text-[#6b7280]">
                    No transcript yet. Generate one to unlock AI-powered content insights.
                  </p>
                  {transcribeError && (
                    <p className="text-[12px] font-medium" style={{ color: '#f87171' }}>
                      {transcribeError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleTranscribe}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-80"
                    style={{ backgroundColor: '#2563eb' }}
                  >
                    Transcribe
                  </button>
                </div>
              )}

              {/* ── Processing ──────────────────────────────────────────── */}
              {localStatus === 'processing' && (
                <div
                  className="flex items-center gap-3 rounded-xl p-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#60a5fa]" />
                  <div>
                    <p className="text-[13px] text-[#9ca3af]">Transcribing…</p>
                    <p className="mt-0.5 text-[11px] text-[#4b5563]">This may take 30–60 seconds for longer reels.</p>
                  </div>
                </div>
              )}

              {/* ── Done ────────────────────────────────────────────────── */}
              {localStatus === 'done' && (
                <div
                  className="rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {/* Transcript header */}
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-[11px] text-[#4b5563]">
                      {transcribedAt ? 'Transcribed just now' : 'Transcript available'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/[0.06]"
                      style={{ color: copied ? '#34d399' : '#9ca3af' }}
                      title="Copy transcript"
                    >
                      {copied
                        ? <><Check className="h-3 w-3" /> Copied</>
                        : <><Copy className="h-3 w-3" /> Copy</>
                      }
                    </button>
                  </div>

                  {/* Transcript text */}
                  <div className="px-4 py-3">
                    {localTranscript ? (
                      <p
                        className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#9ca3af]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {localTranscript}
                      </p>
                    ) : (
                      <p className="text-[12px] italic text-[#4b5563]">Loading transcript…</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {/* (errors are shown inline — no toast needed for transcription) */}
    </>
  )
}
