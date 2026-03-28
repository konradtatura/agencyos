'use client'

import { useState, useEffect } from 'react'
import { X, GripVertical, Check, BarChart2, Loader2, ChevronLeft } from 'lucide-react'
import type { StoryRow } from './stories-view'

// ── Types ───────────────────────────────────────────────────────────────────

interface Props {
  open:      boolean
  onClose:   () => void
  stories:   StoryRow[]
  onCreated: (id: string) => void
}

type CtaType = 'dm' | 'link' | 'poll' | 'reply' | 'none'

interface OrderedSlide {
  story_id:    string
  is_cta_slide: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const CTA_STYLES: Record<CtaType, { active: string; inactive: string; label: string }> = {
  dm: {
    active:   'bg-[rgba(124,58,237,0.20)] border-[rgba(124,58,237,0.40)] text-[#a78bfa]',
    inactive: 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#6b7280]',
    label:    'DM',
  },
  link: {
    active:   'bg-[rgba(37,99,235,0.20)] border-[rgba(37,99,235,0.40)] text-[#60a5fa]',
    inactive: 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#6b7280]',
    label:    'Link',
  },
  poll: {
    active:   'bg-[rgba(5,150,105,0.20)] border-[rgba(5,150,105,0.40)] text-[#34d399]',
    inactive: 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#6b7280]',
    label:    'Poll',
  },
  reply: {
    active:   'bg-[rgba(251,146,60,0.20)] border-[rgba(251,146,60,0.40)] text-[#fb923c]',
    inactive: 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#6b7280]',
    label:    'Reply',
  },
  none: {
    active:   'bg-[rgba(107,114,128,0.20)] border-[rgba(107,114,128,0.40)] text-[#9ca3af]',
    inactive: 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#6b7280]',
    label:    'None',
  },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CreateSequenceModal({ open, onClose, stories, onCreated }: Props) {
  const [step,          setStep]          = useState<1 | 2>(1)
  const [name,          setName]          = useState('')
  const [ctaType,       setCtaType]       = useState<CtaType | null>(null)
  const [orderedSlides, setOrderedSlides] = useState<OrderedSlide[]>([])
  const [draggedIdx,    setDraggedIdx]    = useState<number | null>(null)
  const [dragOverIdx,   setDragOverIdx]   = useState<number | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setName('')
      setCtaType(null)
      setOrderedSlides([])
      setDraggedIdx(null)
      setDragOverIdx(null)
      setSaving(false)
      setError(null)
    }
  }, [open])

  const selectedStoryIds = new Set(orderedSlides.map(s => s.story_id))

  // Filter stories to last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000
  const recentStories = stories.filter(s => new Date(s.posted_at).getTime() >= sevenDaysAgo)

  function handleClose() {
    if (saving) return
    setStep(1)
    setError(null)
    onClose()
  }

  // ── Story card toggle ────────────────────────────────────────────────────

  function toggleStory(story: StoryRow) {
    setOrderedSlides(prev => {
      if (prev.some(s => s.story_id === story.id)) {
        return prev.filter(s => s.story_id !== story.id)
      }
      return [...prev, { story_id: story.id, is_cta_slide: false }]
    })
  }

  // ── CTA slide toggle ─────────────────────────────────────────────────────

  function toggleCtaSlide(storyId: string) {
    setOrderedSlides(prev =>
      prev.map(s => {
        if (s.story_id === storyId) {
          return { ...s, is_cta_slide: !s.is_cta_slide }
        }
        // deselect others
        return { ...s, is_cta_slide: false }
      })
    )
  }

  // ── Drag handlers ────────────────────────────────────────────────────────

  function handleDragStart(idx: number, e: React.DragEvent) {
    setDraggedIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(idx: number, e: React.DragEvent) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function handleDrop(dropIdx: number) {
    if (draggedIdx === null || draggedIdx === dropIdx) {
      setDraggedIdx(null)
      setDragOverIdx(null)
      return
    }
    setOrderedSlides(prev => {
      const next = [...prev]
      const [removed] = next.splice(draggedIdx, 1)
      next.splice(dropIdx, 0, removed)
      return next
    })
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  function handleDragEnd() {
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  // ── Remove slide ─────────────────────────────────────────────────────────

  function removeSlide(storyId: string) {
    setOrderedSlides(prev => prev.filter(s => s.story_id !== storyId))
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (orderedSlides.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/stories/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          cta_type: ctaType,
          slides: orderedSlides.map((s, i) => ({
            story_id:    s.story_id,
            slide_order: i + 1,
            is_cta_slide: s.is_cta_slide,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? data?.message ?? 'Failed to create sequence')
      }
      onCreated(data.id)
      setStep(1)
      setError(null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  // ── Story thumbnail ──────────────────────────────────────────────────────

  function StoryThumbnail({ story, small }: { story: StoryRow; small?: boolean }) {
    const src = story.thumbnail_url ?? story.media_url
    if (src) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={fmtDateTime(story.posted_at)}
          className={small ? 'w-full h-full object-cover' : 'w-full h-full object-cover'}
        />
      )
    }
    return (
      <div className="w-full h-full flex items-center justify-center bg-[rgba(255,255,255,0.04)]">
        <BarChart2 className="text-[#4b5563]" size={small ? 12 : 20} />
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-[880px] mx-auto bg-[#0f172a] rounded-2xl border border-[rgba(255,255,255,0.08)] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          disabled={saving}
          className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-lg text-[#6b7280] hover:text-[#d1d5db] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
        >
          <X size={16} />
        </button>

        {/* ── Step 1: Name & CTA Type ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col p-6 gap-6">
            {/* Header */}
            <div className="flex items-start justify-between pr-10">
              <div>
                <div className="text-[11px] text-[#6b7280] font-medium uppercase tracking-wider mb-1">
                  Step 1 of 2
                </div>
                <h2 className="text-[18px] font-semibold text-[#f9fafb]">New Sequence</h2>
              </div>
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-[#d1d5db]">
                Sequence Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. March 25 DM Sequence"
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.10)] text-[#f9fafb] placeholder-[#4b5563] rounded-lg px-3.5 py-2.5 text-[14px] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] transition-colors"
              />
            </div>

            {/* CTA Type */}
            <div className="flex flex-col gap-3">
              <label className="text-[13px] font-medium text-[#d1d5db]">CTA Type</label>
              <div className="flex items-center gap-2">
                {(['dm', 'link', 'poll', 'reply', 'none'] as CtaType[]).map(type => {
                  const styles = CTA_STYLES[type]
                  const isActive = ctaType === type
                  return (
                    <button
                      key={type}
                      onClick={() => setCtaType(isActive ? null : type)}
                      className={`px-4 py-2 rounded-full border text-[13px] font-medium transition-all duration-150 ${
                        isActive ? styles.active : styles.inactive
                      }`}
                    >
                      {styles.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#d1d5db] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!name.trim() || !ctaType}
                className="px-5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[rgba(37,99,235,0.30)] disabled:text-[#60a5fa]/50 text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Select Slides ────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 pr-12 shrink-0">
              <div>
                <div className="text-[11px] text-[#6b7280] font-medium uppercase tracking-wider mb-1">
                  Step 2 of 2
                </div>
                <h2 className="text-[18px] font-semibold text-[#f9fafb]">Select Slides</h2>
              </div>
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-[13px] text-[#6b7280] hover:text-[#d1d5db] transition-colors mt-1"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            </div>

            {/* Two-column layout */}
            <div className="flex flex-1 overflow-hidden px-6 gap-4 pb-4">
              {/* LEFT: Story grid */}
              <div className="flex-1 overflow-y-auto pr-2">
                {recentStories.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-[#6b7280] text-center px-4">
                    No stories from the last 7 days. Sync to import recent stories.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {recentStories.map(story => {
                      const isSelected = selectedStoryIds.has(story.id)
                      return (
                        <div
                          key={story.id}
                          onClick={() => toggleStory(story)}
                          className="relative cursor-pointer rounded-lg overflow-hidden select-none"
                          style={{ aspectRatio: '9/16' }}
                        >
                          <StoryThumbnail story={story} />

                          {/* Bottom gradient + date */}
                          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent flex items-end px-1.5 pb-1.5">
                            <span className="text-[10px] text-white/80 leading-tight">
                              {fmtDateTime(story.posted_at)}
                            </span>
                          </div>

                          {/* Selected overlay */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-blue-600/30 border-2 border-[#2563eb] rounded-lg">
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#2563eb] flex items-center justify-center">
                                <Check size={11} className="text-white" strokeWidth={3} />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="w-px bg-[rgba(255,255,255,0.06)] shrink-0" />

              {/* RIGHT: Sequence order */}
              <div className="w-[260px] flex flex-col shrink-0 overflow-hidden">
                <div className="shrink-0 mb-1">
                  <div className="text-[11px] uppercase tracking-wider text-[#6b7280] font-medium">
                    Sequence Order
                  </div>
                  <div className="text-[11px] text-[#4b5563] mt-0.5">Drag to reorder</div>
                </div>

                {orderedSlides.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-full border border-dashed border-[rgba(255,255,255,0.10)] rounded-lg p-4 text-center text-[12px] text-[#4b5563] leading-relaxed">
                      Select slides from the left to build your sequence
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto mt-2 flex flex-col gap-0.5">
                    {orderedSlides.map((slide, idx) => {
                      const story = stories.find(s => s.id === slide.story_id)
                      if (!story) return null
                      const isDragging  = draggedIdx === idx
                      const isDropOver  = dragOverIdx === idx && draggedIdx !== idx
                      const thumbSrc    = story.thumbnail_url ?? story.media_url

                      return (
                        <div key={slide.story_id}>
                          {/* Drop indicator line above */}
                          {isDropOver && draggedIdx !== null && draggedIdx > idx && (
                            <div className="h-0.5 bg-[#2563eb] rounded-full mx-2 mb-0.5" />
                          )}

                          <div
                            draggable
                            onDragStart={e => handleDragStart(idx, e)}
                            onDragOver={e => handleDragOver(idx, e)}
                            onDrop={() => handleDrop(idx)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center gap-2 px-1 py-1.5 rounded-lg transition-all ${
                              isDragging
                                ? 'opacity-40'
                                : 'hover:bg-[rgba(255,255,255,0.04)]'
                            }`}
                          >
                            {/* Drag handle */}
                            <GripVertical
                              size={14}
                              className="text-[#4b5563] cursor-grab shrink-0"
                            />

                            {/* Thumbnail */}
                            <div className="w-8 h-14 rounded overflow-hidden shrink-0 bg-[rgba(255,255,255,0.04)]">
                              {thumbSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumbSrc}
                                  alt={fmtDateTime(story.posted_at)}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <BarChart2 size={10} className="text-[#4b5563]" />
                                </div>
                              )}
                            </div>

                            {/* Date */}
                            <span className="text-[11px] text-[#9ca3af] flex-1 min-w-0 truncate">
                              {fmtDateTime(story.posted_at)}
                            </span>

                            {/* CTA pill */}
                            <button
                              onClick={() => toggleCtaSlide(slide.story_id)}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-all shrink-0 ${
                                slide.is_cta_slide
                                  ? 'bg-[rgba(37,99,235,0.20)] text-[#60a5fa] border-[rgba(37,99,235,0.40)]'
                                  : 'text-[#4b5563] border-transparent hover:border-[rgba(255,255,255,0.10)]'
                              }`}
                            >
                              CTA
                            </button>

                            {/* Remove button */}
                            <button
                              onClick={() => removeSlide(slide.story_id)}
                              className="text-[#4b5563] hover:text-[#f87171] transition-colors shrink-0"
                            >
                              <X size={13} />
                            </button>
                          </div>

                          {/* Drop indicator line below */}
                          {isDropOver && draggedIdx !== null && draggedIdx < idx && (
                            <div className="h-0.5 bg-[#2563eb] rounded-full mx-2 mt-0.5" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 shrink-0">
              {error && (
                <p className="text-[12px] text-[#f87171] mb-3 text-right">{error}</p>
              )}
              <div className="flex items-center justify-between pt-4 border-t border-[rgba(255,255,255,0.06)]">
                <button
                  onClick={handleClose}
                  disabled={saving}
                  className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#d1d5db] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={orderedSlides.length === 0 || saving}
                  className="flex items-center gap-2 px-5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[rgba(37,99,235,0.30)] disabled:text-[#60a5fa]/50 text-white text-[13px] font-medium rounded-lg transition-colors"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Create Sequence
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
