'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { X, Pencil, Trash2, BarChart2, Loader2, Star } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface Props {
  sequenceId: string | null
  onClose:    () => void
  onDeleted:  (id: string) => void
  onUpdated:  (id: string, name: string, ctaType: string) => void
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

// ── CtaBadge ──────────────────────────────────────────────────────────────────

const CTA_CFG = {
  dm:    { label: 'DM',    bg: 'rgba(124,58,237,0.18)',  color: '#a78bfa' },
  link:  { label: 'Link',  bg: 'rgba(37,99,235,0.18)',   color: '#60a5fa' },
  poll:  { label: 'Poll',  bg: 'rgba(5,150,105,0.18)',   color: '#34d399' },
  reply: { label: 'Reply', bg: 'rgba(251,146,60,0.18)',  color: '#fb923c' },
  none:  { label: 'None',  bg: 'rgba(107,114,128,0.18)', color: '#9ca3af' },
}

function CtaBadge({ type }: { type: SequenceDetail['cta_type'] }) {
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

// ── MetricTile ────────────────────────────────────────────────────────────────

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">{label}</p>
      <p className="text-[18px] font-bold text-[#f9fafb]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</p>
    </div>
  )
}

// ── SequenceDetailPanel ───────────────────────────────────────────────────────

export default function SequenceDetailPanel({ sequenceId, onClose, onDeleted, onUpdated }: Props) {
  const [open,       setOpen]       = useState(false)
  const [detail,     setDetail]     = useState<SequenceDetail | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [fetchErr,   setFetchErr]   = useState<string | null>(null)

  // Edit state
  const [editMode,   setEditMode]   = useState(false)
  const [editName,   setEditName]   = useState('')
  const [editCta,    setEditCta]    = useState<string>('')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  const handleClose = useCallback(() => {
    setOpen(false)
    setTimeout(onClose, 300)
  }, [onClose])

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Fetch on sequenceId change
  useEffect(() => {
    if (!sequenceId) {
      setOpen(false)
      return
    }
    setOpen(true)
    setDetail(null)
    setFetchErr(null)
    setEditMode(false)
    setDeleteConfirm(false)
    setLoading(true)

    fetch(`/api/stories/sequences/${sequenceId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('not ok')
        const data = await res.json() as SequenceDetail
        setDetail(data)
      })
      .catch(() => setFetchErr('Failed to load sequence'))
      .finally(() => setLoading(false))
  }, [sequenceId])

  // ── Edit handlers ──────────────────────────────────────────────────────────

  function handleEditClick() {
    if (!detail) return
    setEditName(detail.name)
    setEditCta(detail.cta_type)
    setSaveError(null)
    setEditMode(true)
  }

  async function handleSave() {
    if (!detail || !sequenceId) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/stories/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, cta_type: editCta }),
      })
      if (!res.ok) throw new Error('save failed')
      setDetail((prev) =>
        prev ? { ...prev, name: editName, cta_type: editCta as SequenceDetail['cta_type'] } : prev
      )
      onUpdated(detail.id, editName, editCta)
      setEditMode(false)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete handlers ────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!detail || !sequenceId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/stories/sequences/${sequenceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      onDeleted(detail.id)
      handleClose()
    } catch {
      setDeleting(false)
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const slides      = detail?.slides ?? []
  const firstSlide  = slides[0] ?? null
  const lastSlide   = slides[slides.length - 1] ?? null

  const firstImpressions = firstSlide?.story?.impressions ?? null
  const lastImpressions  = lastSlide?.story?.impressions ?? null
  const completionRate   =
    lastImpressions != null && firstImpressions != null && firstImpressions > 0
      ? (lastImpressions / firstImpressions) * 100
      : null
  const totalReplies = slides.reduce((sum, s) => sum + (s.story?.replies ?? 0), 0)

  const hasImpressionsData = slides.some((s) => (s.story?.impressions ?? 0) > 0)

  const chartData = slides.map((s) => ({
    name:        `Slide ${s.slide_order}${s.is_cta_slide ? ' ★' : ''}`,
    impressions: s.story?.impressions ?? 0,
    is_cta:      s.is_cta_slide,
  }))

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!sequenceId && !open) return null

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
        className="fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-full flex-col transition-transform duration-300 ease-out"
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
          className="shrink-0 px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center justify-between gap-3">
            {/* Left: name + badge */}
            <div className="min-w-0 flex-1">
              {editMode ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.06] px-3 py-1.5 text-[15px] font-semibold text-[#f9fafb] outline-none ring-1 ring-white/10 focus:ring-[#2563eb]"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-[16px] font-semibold text-[#f9fafb]">
                    {detail?.name ?? ''}
                  </span>
                  {detail && <CtaBadge type={detail.cta_type} />}
                </div>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex shrink-0 items-center gap-1">
              {editMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setEditMode(false); setSaveError(null) }}
                    disabled={saving}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#9ca3af] transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !editName.trim()}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                    onClick={handleEditClick}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
                    aria-label="Edit sequence"
                  >
                    <Pencil className="h-4 w-4 text-[#9ca3af]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
                    aria-label="Delete sequence"
                  >
                    <Trash2 className="h-4 w-4 text-[#ef4444]" />
                  </button>
                </>
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

          {/* CTA type pills in edit mode */}
          {editMode && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.entries(CTA_CFG) as [SequenceDetail['cta_type'], typeof CTA_CFG[keyof typeof CTA_CFG]][]).map(
                ([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditCta(key)}
                    className="rounded px-3 py-1 text-[12px] font-bold tracking-wider transition-all"
                    style={
                      editCta === key
                        ? { backgroundColor: cfg.bg, color: cfg.color, outline: `1.5px solid ${cfg.color}` }
                        : { backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280', outline: '1px solid rgba(255,255,255,0.08)' }
                    }
                  >
                    {cfg.label}
                  </button>
                )
              )}
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <p className="mt-2 text-[12px] text-[#ef4444]">{saveError}</p>
          )}

          {/* Delete confirmation */}
          {deleteConfirm && !editMode && (
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-lg px-4 py-3"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              <p className="text-[13px] text-[#fca5a5]">
                Delete this sequence? This cannot be undone.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className="rounded-lg px-3 py-1 text-[12px] font-semibold text-[#9ca3af] transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(239,68,68,0.20)', color: '#f87171' }}
                >
                  {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                />
              ))}
            </div>
          )}

          {/* Fetch error */}
          {fetchErr && !loading && (
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3 text-[13px] text-[#fca5a5]"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              {fetchErr}
            </div>
          )}

          {detail && !loading && (
            <>
              {/* ── 1. Drop-off Chart ──────────────────────────────────────── */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">
                  Drop-off
                </p>
                {!hasImpressionsData ? (
                  <p className="text-[13px] text-[#6b7280]">No impression data yet.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={chartData}
                        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.05)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#6b7280', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#6b7280', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8,
                            fontSize: 12,
                            color: '#d1d5db',
                          }}
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        />
                        <Bar dataKey="impressions" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.is_cta ? '#2563eb' : '#334155'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-1.5 text-[11px] text-[#4b5563]">
                      Blue bar = CTA slide
                    </p>
                  </>
                )}
              </div>

              {/* ── 2. Stats Row ───────────────────────────────────────────── */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">
                  Performance
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <MetricTile label="First Impressions" value={fmtNum(firstImpressions)} />
                  <MetricTile label="Completion Rate"   value={fmtPct(completionRate)} />
                  <MetricTile label="Total Replies"     value={fmtNum(totalReplies || null)} />
                  <MetricTile label="Correlated DMs"    value={String(detail.correlated_dm_count)} />
                </div>
              </div>

              {/* ── 3. Slides List ─────────────────────────────────────────── */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">
                    Slides
                  </p>
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-[#6b7280]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                  >
                    {slides.length}
                  </span>
                </div>

                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {slides.length === 0 ? (
                    <div
                      className="flex items-center justify-center py-8 text-[13px] text-[#6b7280]"
                      style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                    >
                      No slides in this sequence.
                    </div>
                  ) : (
                    slides.map((slide, idx) => {
                      const s      = slide.story
                      const thumb  = s?.thumbnail_url ?? s?.media_url ?? null
                      const isLast = idx === slides.length - 1

                      return (
                        <div
                          key={slide.id}
                          className="flex items-center gap-3 px-4 py-3"
                          style={{
                            backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                            borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          {/* Slide number */}
                          <span className="w-5 shrink-0 text-[11px] font-bold text-[#6b7280]">
                            {slide.slide_order}
                          </span>

                          {/* Thumbnail */}
                          <div
                            className="shrink-0 overflow-hidden rounded"
                            style={{
                              width: 32, height: 56,
                              backgroundColor: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.08)',
                            }}
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <BarChart2 className="h-3.5 w-3.5 text-[#374151]" />
                              </div>
                            )}
                          </div>

                          {/* Middle: date + badge */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {slide.is_cta_slide && (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                                  style={{ backgroundColor: 'rgba(37,99,235,0.18)', color: '#60a5fa' }}
                                >
                                  <Star className="h-2.5 w-2.5" />
                                  CTA
                                </span>
                              )}
                              {s?.posted_at && (
                                <span className="text-[12px] text-[#9ca3af]">
                                  {fmtDateTime(s.posted_at)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: metrics */}
                          <div className="shrink-0 flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-[10px] text-[#6b7280]">Impr. / Reach</p>
                              <p
                                className="text-[12px] font-semibold text-[#d1d5db]"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {fmtNum(s?.impressions ?? null)} / {fmtNum(s?.reach ?? null)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-[#6b7280]">Exits / Replies</p>
                              <p
                                className="text-[12px] font-semibold text-[#d1d5db]"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {fmtNum(s?.exits ?? null)} / {fmtNum(s?.replies ?? null)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
