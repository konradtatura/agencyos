'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ExternalLink, Trash2 } from 'lucide-react'
import type { ContentIdea, ContentStage, ContentPlatform } from '@/lib/content-pipeline/types'
import { STAGE_CONFIG, CONTENT_STAGES, daysSince } from '@/lib/content-pipeline/types'

interface ContentDetailSheetProps {
  idea: ContentIdea | null
  onClose: () => void
  onUpdate: (updated: ContentIdea) => void
  onDelete: (id: string) => void
}

const PLATFORM_OPTIONS: { value: ContentPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube',   label: 'YouTube'   },
  { value: 'both',      label: 'Both'      },
]

export default function ContentDetailSheet({
  idea,
  onClose,
  onUpdate,
  onDelete,
}: ContentDetailSheetProps) {
  const [title,          setTitle]          = useState('')
  const [script,         setScript]         = useState('')
  const [platform,       setPlatform]       = useState<ContentPlatform>('instagram')
  const [stage,          setStage]          = useState<ContentStage>('idea')
  const [inspirationUrl, setInspirationUrl] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [editingTitle,   setEditingTitle]   = useState(false)
  const [savedFlash,     setSavedFlash]     = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)

  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevIdeaId     = useRef<string | null>(null)

  // Sync local state when idea changes
  useEffect(() => {
    if (!idea) return
    if (idea.id === prevIdeaId.current) return
    prevIdeaId.current = idea.id
    setTitle(idea.title)
    setScript(idea.script ?? '')
    setPlatform(idea.platform)
    setStage(idea.stage)
    setInspirationUrl(idea.inspiration_url ?? '')
    setAdditionalInfo(idea.additional_info ?? '')
    setEditingTitle(false)
    setConfirmDelete(false)
  }, [idea])

  const save = useCallback(
    async (fields: Partial<{
      title: string
      script: string | null
      platform: ContentPlatform
      stage: ContentStage
      inspiration_url: string | null
      additional_info: string | null
    }>) => {
      if (!idea) return

      try {
        const res = await fetch(`/api/content-ideas/${idea.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(fields),
        })
        if (!res.ok) throw new Error()
        const updated: ContentIdea = await res.json()
        onUpdate(updated)
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1200)
      } catch {
        // silently fail — next auto-save will retry
      }
    },
    [idea, onUpdate]
  )

  // Debounced auto-save for text fields
  const scheduleSave = useCallback(
    (fields: Parameters<typeof save>[0]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => save(fields), 500)
    },
    [save]
  )

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // Keyboard close
  useEffect(() => {
    if (!idea) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idea, onClose])

  const handleStageChange = useCallback(
    async (newStage: ContentStage) => {
      setStage(newStage)
      await save({ stage: newStage })
    },
    [save]
  )

  const handlePlatformChange = useCallback(
    (newPlatform: ContentPlatform) => {
      setPlatform(newPlatform)
      save({ platform: newPlatform })
    },
    [save]
  )

  const handleDelete = useCallback(async () => {
    if (!idea) return
    try {
      const res = await fetch(`/api/content-ideas/${idea.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDelete(idea.id)
      onClose()
    } catch {
      // ignore
    }
  }, [idea, onDelete, onClose])

  const open = !!idea

  const createdDays = idea ? daysSince(idea.created_at) : 0
  const stageDays   = idea ? daysSince(idea.stage_entered_at) : 0
  const stageLabel  = idea ? STAGE_CONFIG[idea.stage].label : ''

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:        'fixed',
          inset:           0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex:          40,
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? 'auto' : 'none',
          transition:      'opacity 0.2s',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position:        'fixed',
          top:             0,
          right:           0,
          bottom:          0,
          width:           600,
          maxWidth:        '100vw',
          backgroundColor: '#0d1117',
          borderLeft:      '1px solid rgba(255,255,255,0.06)',
          zIndex:          50,
          display:         'flex',
          flexDirection:   'column',
          transform:       open ? 'translateX(0)' : 'translateX(100%)',
          transition:      'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          overflowY:       'auto',
        }}
      >
        {idea && (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <div
              style={{
                padding:      '20px 24px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink:   0,
              }}
            >
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                {editingTitle ? (
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      scheduleSave({ title: e.target.value })
                    }}
                    onBlur={() => {
                      setEditingTitle(false)
                      if (title.trim()) save({ title: title.trim() })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') { setTitle(idea.title); setEditingTitle(false) }
                    }}
                    style={{
                      flex:            1,
                      fontSize:        19,
                      fontWeight:      600,
                      color:           '#f9fafb',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border:          '1px solid rgba(37,99,235,0.4)',
                      borderRadius:    8,
                      padding:         '4px 10px',
                      outline:         'none',
                    }}
                  />
                ) : (
                  <h2
                    onClick={() => setEditingTitle(true)}
                    title="Click to edit"
                    style={{
                      flex:       1,
                      fontSize:   19,
                      fontWeight: 600,
                      color:      '#f9fafb',
                      lineHeight: '1.35',
                      cursor:     'text',
                      padding:    '4px 10px',
                      borderRadius: 8,
                      border:     '1px solid transparent',
                      transition: 'border-color 0.12s, background-color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'transparent'
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {title}
                  </h2>
                )}

                {/* Saved flash + close */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 6 }}>
                  <span
                    style={{
                      fontSize:   11,
                      color:      '#10b981',
                      opacity:    savedFlash ? 1 : 0,
                      transition: 'opacity 0.3s',
                    }}
                  >
                    Saved
                  </span>
                  <button
                    onClick={onClose}
                    style={{
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      width:           28,
                      height:          28,
                      borderRadius:    6,
                      border:          'none',
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      color:           '#9ca3af',
                      cursor:          'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Stage + Platform controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* Stage select */}
                <select
                  value={stage}
                  onChange={(e) => handleStageChange(e.target.value as ContentStage)}
                  style={{
                    fontSize:        12.5,
                    fontWeight:      500,
                    padding:         '5px 10px',
                    borderRadius:    8,
                    border:          '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    color:           STAGE_CONFIG[stage].badgeColor,
                    cursor:          'pointer',
                    outline:         'none',
                  }}
                >
                  {CONTENT_STAGES.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: '#111827', color: '#f9fafb' }}>
                      {STAGE_CONFIG[s].label}
                    </option>
                  ))}
                </select>

                {/* Platform toggles */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {PLATFORM_OPTIONS.map((p) => {
                    const isActive = platform === p.value
                    return (
                      <button
                        key={p.value}
                        onClick={() => handlePlatformChange(p.value)}
                        style={{
                          fontSize:        11.5,
                          fontWeight:      isActive ? 600 : 400,
                          padding:         '4px 10px',
                          borderRadius:    20,
                          border:          'none',
                          cursor:          'pointer',
                          transition:      'all 0.12s',
                          backgroundColor: isActive ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.04)',
                          color:           isActive ? '#60a5fa'             : '#6b7280',
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Script — primary field, gets most vertical space */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <label
                  style={{
                    fontSize:     11,
                    fontWeight:   600,
                    color:        '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom:  8,
                    display:       'block',
                  }}
                >
                  Script
                </label>
                <textarea
                  value={script}
                  placeholder="Write your script here..."
                  onChange={(e) => {
                    setScript(e.target.value)
                    scheduleSave({ script: e.target.value })
                  }}
                  onBlur={() => save({ script: script || null })}
                  style={{
                    flex:            1,
                    minHeight:       280,
                    resize:          'vertical',
                    fontSize:        13,
                    fontFamily:      'var(--font-mono, "JetBrains Mono", monospace)',
                    lineHeight:      '1.65',
                    color:           '#e5e7eb',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border:          '1px solid rgba(255,255,255,0.08)',
                    borderRadius:    8,
                    padding:         '12px 14px',
                    outline:         'none',
                    transition:      'border-color 0.15s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
              </div>

              {/* Inspiration URL */}
              <div>
                <label
                  style={{
                    fontSize:     11,
                    fontWeight:   600,
                    color:        '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom:  8,
                    display:       'block',
                  }}
                >
                  Inspiration Link
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    value={inspirationUrl}
                    placeholder="https://..."
                    onChange={(e) => {
                      setInspirationUrl(e.target.value)
                      scheduleSave({ inspiration_url: e.target.value || null })
                    }}
                    onBlur={() => save({ inspiration_url: inspirationUrl || null })}
                    style={{
                      width:           '100%',
                      fontSize:        13,
                      color:           '#e5e7eb',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border:          '1px solid rgba(255,255,255,0.08)',
                      borderRadius:    8,
                      padding:         inspirationUrl ? '9px 38px 9px 12px' : '9px 12px',
                      outline:         'none',
                      boxSizing:       'border-box',
                      transition:      'border-color 0.15s',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                    onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                  />
                  {inspirationUrl && (
                    <a
                      href={inspirationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: 'absolute',
                        right:    10,
                        top:      '50%',
                        transform: 'translateY(-50%)',
                        color:    '#2563eb',
                        display:  'flex',
                      }}
                      title="Open link"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>

              {/* Additional Info */}
              <div>
                <label
                  style={{
                    fontSize:     11,
                    fontWeight:   600,
                    color:        '#4b5563',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom:  8,
                    display:       'block',
                  }}
                >
                  Additional Info
                </label>
                <textarea
                  value={additionalInfo}
                  placeholder="Notes, references, target metrics..."
                  rows={3}
                  onChange={(e) => {
                    setAdditionalInfo(e.target.value)
                    scheduleSave({ additional_info: e.target.value || null })
                  }}
                  onBlur={() => save({ additional_info: additionalInfo || null })}
                  style={{
                    width:           '100%',
                    resize:          'vertical',
                    fontSize:        13,
                    lineHeight:      '1.6',
                    color:           '#e5e7eb',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border:          '1px solid rgba(255,255,255,0.08)',
                    borderRadius:    8,
                    padding:         '10px 12px',
                    outline:         'none',
                    boxSizing:       'border-box',
                    transition:      'border-color 0.15s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
              </div>

              {/* Metadata footer */}
              <p style={{ fontSize: 11.5, color: '#374151', lineHeight: '1.6' }}>
                Created {createdDays === 0 ? 'today' : `${createdDays} day${createdDays !== 1 ? 's' : ''} ago`}
                {' · '}
                In <span style={{ color: STAGE_CONFIG[idea.stage].badgeColor }}>{stageLabel}</span> for{' '}
                {stageDays === 0 ? 'less than a day' : `${stageDays} day${stageDays !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* ── Footer: Delete ─────────────────────────────────────── */}
            <div
              style={{
                padding:    '16px 24px',
                borderTop:  '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}
            >
              {confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af', flex: 1 }}>
                    Delete this idea? This can&apos;t be undone.
                  </span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      fontSize: 13, padding: '6px 14px', borderRadius: 7,
                      border: '1px solid rgba(255,255,255,0.1)',
                      backgroundColor: 'transparent', color: '#9ca3af', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    style={{
                      fontSize: 13, padding: '6px 14px', borderRadius: 7,
                      border: 'none',
                      backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         6,
                    fontSize:    13,
                    color:       '#ef4444',
                    cursor:      'pointer',
                    background:  'none',
                    border:      'none',
                    padding:     0,
                  }}
                >
                  <Trash2 size={13} />
                  Delete idea
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
