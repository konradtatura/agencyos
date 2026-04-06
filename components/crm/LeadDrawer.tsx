'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Calendar, DollarSign, Send, ExternalLink } from 'lucide-react'
import type { LeadWithRelations, PipelineStage } from '@/types/crm'
import ActivityTimeline from './ActivityTimeline'
import DisqualifyModal from './DisqualifyModal'

// ── Config ────────────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  ht: { label: 'HT', bg: 'rgba(37,99,235,0.18)',   color: '#60a5fa', border: 'rgba(37,99,235,0.3)'  },
  mt: { label: 'MT', bg: 'rgba(245,158,11,0.18)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  lt: { label: 'LT', bg: 'rgba(16,185,129,0.18)',  color: '#34d399', border: 'rgba(16,185,129,0.3)' },
}

const SOURCE_LABELS: Record<string, string> = {
  story: 'Story', reel: 'Reel', organic: 'Organic',
  manual: 'Manual', vsl_funnel: 'VSL',
}
const SOURCE_COLORS: Record<string, string> = {
  story: '#c084fc', reel: '#60a5fa', organic: '#9ca3af',
  manual: '#9ca3af', vsl_funnel: '#34d399',
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#4b5563',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 5,
}

interface TeamMember { id: string; full_name: string | null; email: string | null; role: string }

// ── Props ─────────────────────────────────────────────────────────────────────

interface LeadDrawerProps {
  leadId:       string | null
  stages:       PipelineStage[]
  onClose:      () => void
  onLeadUpdated: (lead: LeadWithRelations) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LeadDrawer({ leadId, stages, onClose, onLeadUpdated }: LeadDrawerProps) {
  const open = !!leadId

  const [lead,           setLead]           = useState<LeadWithRelations | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [editingName,    setEditingName]    = useState(false)
  const [nameVal,        setNameVal]        = useState('')
  const [dealVal,        setDealVal]        = useState('')
  const [followUpVal,    setFollowUpVal]    = useState('')
  const [setterId,       setSetterId]       = useState('')
  const [closerId,       setCloserId]       = useState('')
  const [noteText,       setNoteText]       = useState('')
  const [savingNote,     setSavingNote]     = useState(false)
  const [teamMembers,    setTeamMembers]    = useState<TeamMember[]>([])
  const [disqualifyOpen, setDisqualifyOpen] = useState(false)
  const [stageMoving,    setStageMoving]    = useState<string | null>(null)

  const prevLeadId = useRef<string | null>(null)
  const noteRef    = useRef<HTMLTextAreaElement>(null)

  // Fetch team members once
  useEffect(() => {
    fetch('/api/team/members')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setTeamMembers(d) })
      .catch(() => {})
  }, [])

  // Fetch lead when leadId changes
  useEffect(() => {
    if (!leadId || leadId === prevLeadId.current) return
    prevLeadId.current = leadId
    setLoading(true)
    setEditingName(false)
    setNoteText('')

    fetch(`/api/crm/leads/${leadId}`)
      .then((r) => r.json())
      .then((data: LeadWithRelations) => {
        setLead(data)
        setNameVal(data.name)
        setDealVal(data.deal_value != null ? String(data.deal_value) : '')
        setFollowUpVal(data.follow_up_date ?? '')
        setSetterId(data.assigned_setter_id ?? '')
        setCloserId(data.assigned_closer_id ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [leadId])

  // Reset prevLeadId when closed so next open always refetches
  useEffect(() => {
    if (!open) { prevLeadId.current = null; setLead(null) }
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    if (!lead) return
    // Optimistic update
    const updated = { ...lead, ...fields } as LeadWithRelations
    setLead(updated)
    onLeadUpdated(updated)

    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) throw new Error()
      const fresh: LeadWithRelations = { ...await res.json(), stage_history: lead.stage_history, notes: lead.notes }
      setLead(fresh)
      onLeadUpdated(fresh)
    } catch {
      // Revert
      setLead(lead)
    }
  }, [lead, onLeadUpdated])

  const moveStage = useCallback(async (stageName: string) => {
    if (!lead || stageMoving) return
    setStageMoving(stageName)
    const prev = lead

    // Optimistic
    const optimistic = { ...lead, stage: stageName } as LeadWithRelations
    setLead(optimistic)
    onLeadUpdated(optimistic)

    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_stage: stageName }),
      })
      if (!res.ok) throw new Error()
      const updatedLead = await res.json()
      const fresh: LeadWithRelations = { ...updatedLead, stage_history: lead.stage_history, notes: lead.notes }
      // Add history entry optimistically
      fresh.stage_history = [
        ...lead.stage_history,
        {
          id: `opt-${Date.now()}`,
          lead_id:   lead.id,
          from_stage: lead.stage,
          to_stage:  stageName,
          changed_by: null,
          changed_at: new Date().toISOString(),
          note:      null,
        },
      ]
      setLead(fresh)
      onLeadUpdated(fresh)
    } catch {
      setLead(prev)
    } finally {
      setStageMoving(null)
    }
  }, [lead, stageMoving, onLeadUpdated])

  const submitNote = useCallback(async () => {
    if (!lead || !noteText.trim() || savingNote) return
    setSavingNote(true)
    const text = noteText.trim()
    setNoteText('')

    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: text }),
      })
      if (!res.ok) throw new Error()
      const note = await res.json()
      const fresh: LeadWithRelations = { ...lead, notes: [...lead.notes, note] }
      setLead(fresh)
      onLeadUpdated(fresh)
    } catch {
      setNoteText(text) // restore on error
    } finally {
      setSavingNote(false)
    }
  }, [lead, noteText, savingNote, onLeadUpdated])

  // ── User name map for timeline ────────────────────────────────────────────────
  const userNames: Record<string, string> = {}
  teamMembers.forEach((m) => {
    userNames[m.id] = m.full_name ?? m.email ?? m.id
  })

  // ── Input style ───────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7,
    fontSize: 12.5, color: '#e5e7eb',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.12s',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center',
    paddingRight: 28,
  }

  const setters = teamMembers.filter((m) => m.role === 'setter' || m.role === 'super_admin')
  const closers = teamMembers.filter((m) => m.role === 'closer' || m.role === 'super_admin')

  const tier    = lead?.offer_tier ? TIER_CONFIG[lead.offer_tier as keyof typeof TIER_CONFIG] : null
  const source  = lead?.lead_source_type ? SOURCE_LABELS[lead.lead_source_type] : null
  const srcClr  = lead?.lead_source_type ? SOURCE_COLORS[lead.lead_source_type] : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          zIndex: 39,
          opacity:       open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition:    'opacity 0.2s',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 480, maxWidth: '100vw',
          backgroundColor: '#0d1117',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          zIndex: 40,
          display: 'flex', flexDirection: 'column',
          transform:  open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
        }}
      >
        {/* Loading state */}
        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 20, height: 20, border: '2px solid rgba(37,99,235,0.3)', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        )}

        {/* Content */}
        {!loading && lead && (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                {editingName ? (
                  <input
                    autoFocus
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    onBlur={() => {
                      setEditingName(false)
                      if (nameVal.trim() && nameVal.trim() !== lead.name) patch({ name: nameVal.trim() })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') { setNameVal(lead.name); setEditingName(false) }
                    }}
                    style={{
                      flex: 1, fontSize: 17, fontWeight: 600, color: '#f9fafb',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(37,99,235,0.4)',
                      borderRadius: 8, padding: '3px 9px', outline: 'none',
                    }}
                  />
                ) : (
                  <h2
                    onClick={() => setEditingName(true)}
                    title="Click to edit name"
                    style={{
                      flex: 1, fontSize: 17, fontWeight: 600, color: '#f9fafb',
                      cursor: 'text', padding: '3px 9px', borderRadius: 8,
                      border: '1px solid transparent',
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
                    {lead.name}
                  </h2>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 4 }}>
                  {/* Full detail link */}
                  <a
                    href={`/dashboard/crm/${lead.id}`}
                    title="Open full detail page"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280', textDecoration: 'none' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#9ca3af' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6b7280' }}
                  >
                    <ExternalLink size={12} />
                  </a>
                  <button
                    onClick={onClose}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280', cursor: 'pointer' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Badges row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {tier && (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, backgroundColor: tier.bg, color: tier.color, border: `1px solid ${tier.border}` }}>
                    {tier.label}
                  </span>
                )}
                {lead.ig_handle && (
                  <span style={{ fontSize: 11.5, color: '#6b7280' }}>@{lead.ig_handle}</span>
                )}
                {source && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: srcClr ?? '#9ca3af', backgroundColor: `${srcClr}15` }}>
                    {source}
                  </span>
                )}
              </div>
            </div>

            {/* ── Stage pills ─────────────────────────────────────────── */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <span style={{ ...FIELD_LABEL }}>Stage</span>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {stages.map((stage) => {
                  const isCurrent = lead.stage === stage.name
                  const isMoving  = stageMoving === stage.name
                  return (
                    <button
                      key={stage.id}
                      onClick={() => !isCurrent && moveStage(stage.name)}
                      disabled={!!stageMoving}
                      title={stage.name}
                      style={{
                        flexShrink: 0,
                        padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: isCurrent ? 600 : 400,
                        cursor: isCurrent ? 'default' : 'pointer',
                        transition: 'all 0.12s',
                        opacity: stageMoving && !isCurrent && !isMoving ? 0.5 : 1,
                        backgroundColor: isCurrent ? `${stage.color}22` : 'rgba(255,255,255,0.04)',
                        border: isCurrent ? `1.5px solid ${stage.color}60` : '1.5px solid rgba(255,255,255,0.08)',
                        color: isCurrent ? stage.color : '#6b7280',
                        boxShadow: isCurrent ? `0 0 8px ${stage.color}30` : 'none',
                      }}
                    >
                      {isMoving ? '…' : stage.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Quick edit fields ────────────────────────────────────── */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {/* Deal value */}
                <div>
                  <label style={FIELD_LABEL}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <DollarSign size={9} />Deal Value
                    </span>
                  </label>
                  <input
                    type="number"
                    value={dealVal}
                    onChange={(e) => setDealVal(e.target.value)}
                    onBlur={() => {
                      const v = dealVal === '' ? null : Number(dealVal)
                      if (v !== lead.deal_value) patch({ deal_value: v })
                    }}
                    placeholder="0"
                    style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                    onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                  />
                </div>

                {/* Follow-up date */}
                <div>
                  <label style={FIELD_LABEL}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={9} />Follow-up
                    </span>
                  </label>
                  <input
                    type="date"
                    value={followUpVal}
                    onChange={(e) => setFollowUpVal(e.target.value)}
                    onBlur={() => {
                      const v = followUpVal || null
                      if (v !== lead.follow_up_date) patch({ follow_up_date: v })
                    }}
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                    onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                  />
                </div>
              </div>

              {/* Assignment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={FIELD_LABEL}>Setter</label>
                  <select
                    value={setterId}
                    onChange={(e) => {
                      setSetterId(e.target.value)
                      patch({ assigned_setter_id: e.target.value || null })
                    }}
                    style={selectStyle}
                  >
                    <option value="">Unassigned</option>
                    {setters.map((m) => (
                      <option key={m.id} value={m.id} style={{ backgroundColor: '#0d1117' }}>
                        {m.full_name ?? m.email ?? m.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={FIELD_LABEL}>Closer</label>
                  <select
                    value={closerId}
                    onChange={(e) => {
                      setCloserId(e.target.value)
                      patch({ assigned_closer_id: e.target.value || null })
                    }}
                    style={selectStyle}
                  >
                    <option value="">Unassigned</option>
                    {closers.map((m) => (
                      <option key={m.id} value={m.id} style={{ backgroundColor: '#0d1117' }}>
                        {m.full_name ?? m.email ?? m.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Disqualify ───────────────────────────────────────────── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                onClick={() => setDisqualifyOpen(true)}
                style={{
                  fontSize: 12, fontWeight: 500, color: '#ef4444',
                  padding: '5px 12px', borderRadius: 6,
                  border: '1px solid rgba(239,68,68,0.2)',
                  backgroundColor: 'rgba(239,68,68,0.06)',
                  cursor: 'pointer', transition: 'filter 0.12s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.2)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1)' }}
              >
                Disqualify lead
              </button>
            </div>

            {/* ── Notes ───────────────────────────────────────────────── */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <label style={FIELD_LABEL}>Add a note</label>
              <div style={{ position: 'relative' }}>
                <textarea
                  ref={noteRef}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      submitNote()
                    }
                  }}
                  placeholder="Add a note… (⌘+Enter to save)"
                  rows={3}
                  style={{
                    width: '100%', resize: 'vertical', fontSize: 13,
                    lineHeight: 1.6, color: '#e5e7eb',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, padding: '9px 12px',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
                {noteText.trim() && (
                  <button
                    onClick={submitNote}
                    disabled={savingNote}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 600,
                      backgroundColor: savingNote ? 'rgba(37,99,235,0.5)' : '#2563eb',
                      color: '#fff', border: 'none', cursor: savingNote ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.12s',
                    }}
                  >
                    <Send size={10} />
                    {savingNote ? '…' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Activity timeline ────────────────────────────────────── */}
            <div style={{ padding: '14px 20px', flex: 1 }}>
              <label style={FIELD_LABEL}>Activity</label>
              <ActivityTimeline
                history={lead.stage_history}
                notes={lead.notes}
                userNames={userNames}
              />
            </div>
          </>
        )}
      </div>

      {/* Disqualify modal (z-index 50, above drawer) */}
      {lead && (
        <DisqualifyModal
          leadId={lead.id}
          leadName={lead.name}
          isOpen={disqualifyOpen}
          onClose={() => setDisqualifyOpen(false)}
          onComplete={() => {
            setDisqualifyOpen(false)
            onClose()
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
