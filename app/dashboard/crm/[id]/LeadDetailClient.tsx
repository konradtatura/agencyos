'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Send, Loader2, Calendar, DollarSign,
  Clock, TrendingDown, Mail, Phone, Link2, User, ChevronDown,
} from 'lucide-react'
import type { LeadWithRelations, LeadNote, LeadStage, DowngradeStage, OfferTier } from '@/types/crm'

const MAIN_PIPELINE_STAGES = [
  'dmd', 'qualifying', 'qualified', 'call_booked', 'showed',
  'closed_won', 'closed_lost', 'follow_up', 'nurture', 'disqualified', 'dead',
]
const DOWNGRADE_PIPELINE_STAGES = ['offered', 'interested', 'booked', 'closed']
import ActivityTimeline from '@/components/crm/ActivityTimeline'
import DisqualifyModal from '@/components/crm/DisqualifyModal'

// ── Config ────────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  dmd: "DM'd", qualifying: 'Qualifying', qualified: 'Qualified',
  call_booked: 'Call Booked', showed: 'Showed', closed_won: 'Closed Won',
  closed_lost: 'Closed Lost', follow_up: 'Follow-Up', nurture: 'Nurture',
  disqualified: 'Disqualified', dead: 'Dead',
  offered: 'Offered', interested: 'Interested', booked: 'Booked', closed: 'Closed',
}

const STAGE_COLORS: Record<string, string> = {
  dmd: '#6366f1', qualifying: '#8b5cf6', qualified: '#2563eb',
  call_booked: '#0ea5e9', showed: '#f59e0b', closed_won: '#10b981',
  closed_lost: '#ef4444', follow_up: '#f97316', nurture: '#14b8a6',
  disqualified: '#9ca3af', dead: '#4b5563',
  offered: '#6366f1', interested: '#8b5cf6', booked: '#f59e0b', closed: '#10b981',
}

const TIER_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  ht: { label: 'High Ticket', bg: 'rgba(37,99,235,0.15)',   color: '#60a5fa',  border: 'rgba(37,99,235,0.3)'  },
  mt: { label: 'Mid Ticket',  bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24',  border: 'rgba(245,158,11,0.3)' },
  lt: { label: 'Low Ticket',  bg: 'rgba(16,185,129,0.15)',  color: '#34d399',  border: 'rgba(16,185,129,0.3)' },
}

const SOURCE_LABELS: Record<string, string> = {
  story: 'Story', reel: 'Reel', organic: 'Organic', manual: 'Manual',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      style={{
        flex: 1, minWidth: 0,
        backgroundColor: '#0d1117',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10.5, color: '#4b5563', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <p style={{ fontSize: 18, fontWeight: 600, color: '#f9fafb', lineHeight: 1.2 }}>{value}</p>
      {sub && <p style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#0d1117',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      }}
    >
      <p style={{ fontSize: 10.5, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function SavedFlash({ show }: { show: boolean }) {
  return (
    <span
      style={{
        fontSize: 10.5, color: '#10b981', fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 3,
        opacity: show ? 1 : 0, transition: 'opacity 0.2s',
      }}
    >
      <Check size={10} strokeWidth={3} />
      Saved
    </span>
  )
}

function nativeSelectStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '6px 28px 6px 10px', borderRadius: 7, fontSize: 12,
    color: '#e5e7eb', backgroundColor: '#111827',
    border: '1px solid rgba(255,255,255,0.08)',
    appearance: 'none', cursor: 'pointer', outline: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface TeamMember { id: string; full_name: string; email: string }

interface LeadDetailClientProps {
  initialLead: LeadWithRelations
  userNames: Record<string, string>
}

export default function LeadDetailClient({ initialLead, userNames }: LeadDetailClientProps) {
  const router = useRouter()

  const [lead, setLead] = useState(initialLead)
  const [notes, setNotes] = useState<LeadNote[]>(initialLead.notes)
  const [savedField, setSavedField] = useState<string | null>(null)
  const [stageSaving, setStageSaving] = useState(false)
  const [disqualifyOpen, setDisqualifyOpen] = useState(false)

  // Inline editing fields
  const [nameValue, setNameValue] = useState(initialLead.name)
  const [handleValue, setHandleValue] = useState(initialLead.ig_handle ?? '')
  const [emailValue, setEmailValue] = useState(initialLead.email ?? '')
  const [phoneValue, setPhoneValue] = useState(initialLead.phone ?? '')
  const [dealInputValue, setDealInputValue] = useState(
    initialLead.deal_value != null ? String(initialLead.deal_value) : ''
  )
  const [followUpValue, setFollowUpValue] = useState(initialLead.follow_up_date ?? '')

  // Notes
  const [noteText, setNoteText] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)

  // Team members
  const [setters, setSetters] = useState<TeamMember[]>([])
  const [closers, setClosers] = useState<TeamMember[]>([])

  const leadRef = useRef(lead)
  useEffect(() => { leadRef.current = lead }, [lead])

  useEffect(() => {
    fetch('/api/team/members?role=setter').then(r => r.json()).then(setSetters).catch(() => {})
    fetch('/api/team/members?role=closer').then(r => r.json()).then(setClosers).catch(() => {})
  }, [])

  const flash = useCallback((fieldKey: string) => {
    setSavedField(fieldKey)
    setTimeout(() => setSavedField(f => f === fieldKey ? null : f), 1800)
  }, [])

  const patchAndFlash = useCallback(async (
    updates: Record<string, unknown>,
    fieldKey: string,
  ) => {
    const prev = leadRef.current
    setLead(curr => ({ ...curr, ...updates }))
    try {
      const res = await fetch(`/api/crm/leads/${prev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error()
      flash(fieldKey)
    } catch {
      setLead(prev)
    }
  }, [flash])

  async function handleStageChange(newStage: string) {
    if (stageSaving) return
    const isDowngrade = lead.pipeline_type === 'downgrade'
    const prev = leadRef.current
    setStageSaving(true)
    setLead(curr => isDowngrade
      ? { ...curr, downgrade_stage: newStage as DowngradeStage }
      : { ...curr, stage: newStage as LeadStage }
    )
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isDowngrade
            ? { to_stage: newStage, pipeline: 'downgrade' }
            : { to_stage: newStage }
        ),
      })
      if (!res.ok) throw new Error()
    } catch {
      setLead(prev)
    } finally {
      setStageSaving(false)
    }
  }

  async function handleNoteSubmit() {
    const text = noteText.trim()
    if (!text || submittingNote) return
    setSubmittingNote(true)
    setNoteText('')
    const tempNote: LeadNote = {
      id: `temp-${Date.now()}`,
      lead_id: lead.id,
      author_id: null,
      note_text: text,
      created_at: new Date().toISOString(),
    }
    setNotes(prev => [...prev, tempNote])
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: text }),
      })
      if (!res.ok) throw new Error()
      const real: LeadNote = await res.json()
      setNotes(prev => prev.map(n => n.id === tempNote.id ? real : n))
    } catch {
      setNotes(prev => prev.filter(n => n.id !== tempNote.id))
      setNoteText(text)
    } finally {
      setSubmittingNote(false)
    }
  }

  // Derived values
  const isDowngrade = lead.pipeline_type === 'downgrade'
  const currentStage = isDowngrade ? (lead.downgrade_stage ?? 'offered') : lead.stage
  const stageColor = STAGE_COLORS[currentStage] ?? '#6b7280'
  const stageOptions = isDowngrade ? DOWNGRADE_PIPELINE_STAGES : MAIN_PIPELINE_STAGES
  const tierCfg = lead.offer_tier ? TIER_CONFIG[lead.offer_tier] : null
  const daysInPipeline = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000)

  const followUpDisplay = lead.follow_up_date
    ? new Date(lead.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  const dealDisplay = lead.deal_value != null
    ? `$${lead.deal_value.toLocaleString()}`
    : '—'

  // Merge userNames with resolved setter/closer
  const allNames = { ...userNames }
  if (lead.assigned_setter_id && lead.setter_name) allNames[lead.assigned_setter_id] = lead.setter_name
  if (lead.assigned_closer_id && lead.closer_name) allNames[lead.assigned_closer_id] = lead.closer_name

  return (
    <>
      {/* Back nav */}
      <button
        onClick={() => router.push('/dashboard/crm')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: '#6b7280', marginBottom: 20,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#9ca3af' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#6b7280' }}
      >
        <ArrowLeft size={13} strokeWidth={2} />
        Back to Pipeline
      </button>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── LEFT COLUMN (65%) ──────────────────────────────────────── */}
        <div style={{ flex: '0 0 calc(65% - 10px)', minWidth: 0 }}>

          {/* Contact header card */}
          <div
            style={{
              backgroundColor: '#0d1117',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14, padding: '18px 20px', marginBottom: 14,
            }}
          >
            {/* Name + handle row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onBlur={() => {
                      const v = nameValue.trim()
                      if (v && v !== lead.name) patchAndFlash({ name: v }, 'name')
                      else setNameValue(lead.name)
                    }}
                    style={{
                      fontSize: 20, fontWeight: 700, color: '#f9fafb', background: 'none',
                      border: 'none', outline: 'none', padding: 0, width: '100%',
                      borderBottom: '1px solid transparent',
                    }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(37,99,235,0.4)' }}
                    onBlurCapture={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
                  />
                  <SavedFlash show={savedField === 'name'} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 500, lineHeight: 1 }}>@</span>
                  <input
                    value={handleValue}
                    onChange={e => setHandleValue(e.target.value)}
                    onBlur={() => {
                      const v = handleValue.trim().replace(/^@/, '')
                      if (v !== (lead.ig_handle ?? '')) patchAndFlash({ ig_handle: v || null }, 'ig_handle')
                      else setHandleValue(lead.ig_handle ?? '')
                    }}
                    placeholder="Instagram handle"
                    style={{
                      fontSize: 12.5, color: '#6b7280', background: 'none',
                      border: 'none', outline: 'none', padding: 0,
                      borderBottom: '1px solid transparent',
                    }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = 'rgba(37,99,235,0.3)' }}
                    onBlurCapture={e => { e.currentTarget.style.borderBottomColor = 'transparent' }}
                  />
                  <SavedFlash show={savedField === 'ig_handle'} />
                </div>
              </div>

              {/* Tier badge */}
              {tierCfg && (
                <span
                  style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                    padding: '3px 8px', borderRadius: 5,
                    backgroundColor: tierCfg.bg, color: tierCfg.color, border: `1px solid ${tierCfg.border}`,
                  }}
                >
                  {tierCfg.label.toUpperCase().split(' ')[0]}T
                </span>
              )}
            </div>

            {/* Stage + actions row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Stage select */}
              <div style={{ position: 'relative', minWidth: 160 }}>
                <div
                  style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    width: 7, height: 7, borderRadius: '50%', backgroundColor: stageColor,
                    boxShadow: `0 0 6px ${stageColor}80`, pointerEvents: 'none', zIndex: 1,
                  }}
                />
                <select
                  value={currentStage}
                  onChange={e => handleStageChange(e.target.value)}
                  disabled={stageSaving}
                  style={{
                    ...nativeSelectStyle(),
                    paddingLeft: 24, fontSize: 12.5, fontWeight: 600,
                    color: stageColor, opacity: stageSaving ? 0.6 : 1,
                  }}
                >
                  {stageOptions.map(s => (
                    <option key={s} value={s} style={{ color: '#e5e7eb' }}>
                      {STAGE_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pipeline badge */}
              {isDowngrade && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10.5, color: '#f59e0b', fontWeight: 600,
                    padding: '3px 8px', borderRadius: 5,
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}
                >
                  <TrendingDown size={10} strokeWidth={2.5} />
                  Downgrade Pipeline
                </span>
              )}

              {/* Disqualify button (main pipeline only) */}
              {!isDowngrade && lead.stage !== 'dead' && lead.stage !== 'disqualified' && (
                <button
                  onClick={() => setDisqualifyOpen(true)}
                  style={{
                    marginLeft: 'auto', fontSize: 11.5, fontWeight: 500, color: '#ef4444',
                    padding: '5px 12px', borderRadius: 6,
                    border: '1px solid rgba(239,68,68,0.2)',
                    backgroundColor: 'rgba(239,68,68,0.06)', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.06)' }}
                >
                  Disqualify
                </button>
              )}
            </div>
          </div>

          {/* Metrics strip */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <MetricCard
              icon={<Clock size={11} color="#4b5563" strokeWidth={2} />}
              label="Days in Pipeline"
              value={daysInPipeline === 0 ? 'Today' : `${daysInPipeline}d`}
              sub={new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <MetricCard
              icon={<ChevronDown size={11} color="#4b5563" strokeWidth={2} />}
              label="Current Stage"
              value={STAGE_LABELS[currentStage] ?? currentStage}
              sub={isDowngrade ? 'Downgrade pipeline' : 'Main pipeline'}
            />
            <MetricCard
              icon={<DollarSign size={11} color="#4b5563" strokeWidth={2} />}
              label="Deal Value"
              value={dealDisplay}
            />
            <MetricCard
              icon={<Calendar size={11} color="#4b5563" strokeWidth={2} />}
              label="Follow-Up"
              value={followUpDisplay}
            />
          </div>

          {/* Activity + Notes */}
          <div
            style={{
              backgroundColor: '#0d1117',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: '18px 20px',
            }}
          >
            <p
              style={{
                fontSize: 10.5, fontWeight: 600, color: '#4b5563',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 18,
              }}
            >
              Activity
            </p>

            {/* Note composer */}
            <div
              style={{
                display: 'flex', gap: 10, marginBottom: 24,
                padding: '10px 12px',
                backgroundColor: '#111827',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
              }}
            >
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNoteSubmit()
                }}
                placeholder="Add a note… (⌘+Enter to save)"
                rows={2}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                  fontSize: 12.5, color: '#d1d5db', lineHeight: 1.5,
                }}
              />
              <button
                onClick={handleNoteSubmit}
                disabled={!noteText.trim() || submittingNote}
                style={{
                  flexShrink: 0, width: 30, height: 30, borderRadius: 7, alignSelf: 'flex-end',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: noteText.trim() ? '#2563eb' : 'rgba(255,255,255,0.04)',
                  border: noteText.trim() ? 'none' : '1px solid rgba(255,255,255,0.07)',
                  cursor: noteText.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.12s',
                }}
              >
                {submittingNote
                  ? <Loader2 size={13} color="#9ca3af" style={{ animation: 'spin 0.7s linear infinite' }} />
                  : <Send size={13} color={noteText.trim() ? '#fff' : '#374151'} strokeWidth={2} />
                }
              </button>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <ActivityTimeline
              history={lead.stage_history}
              notes={notes}
              userNames={allNames}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN (35%) ──────────────────────────────────────── */}
        <div style={{ flex: '0 0 calc(35% - 10px)', minWidth: 0 }}>

          {/* Assignment card */}
          <SidebarCard title="Assignment">
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Setter</p>
              <div style={{ position: 'relative' }}>
                <select
                  value={lead.assigned_setter_id ?? ''}
                  onChange={e => {
                    const v = e.target.value || null
                    patchAndFlash({ assigned_setter_id: v }, 'setter')
                  }}
                  style={nativeSelectStyle()}
                >
                  <option value="">Unassigned</option>
                  {setters.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ height: 16, marginTop: 2 }}>
                <SavedFlash show={savedField === 'setter'} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Closer</p>
              <div style={{ position: 'relative' }}>
                <select
                  value={lead.assigned_closer_id ?? ''}
                  onChange={e => {
                    const v = e.target.value || null
                    patchAndFlash({ assigned_closer_id: v }, 'closer')
                  }}
                  style={nativeSelectStyle()}
                >
                  <option value="">Unassigned</option>
                  {closers.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ height: 16, marginTop: 2 }}>
                <SavedFlash show={savedField === 'closer'} />
              </div>
            </div>
          </SidebarCard>

          {/* Deal value + follow-up */}
          <SidebarCard title="Deal Details">
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Deal Value ($)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={dealInputValue}
                  onChange={e => setDealInputValue(e.target.value)}
                  onBlur={() => {
                    const num = dealInputValue.trim() === '' ? null : Number(dealInputValue)
                    if (isNaN(num as number)) { setDealInputValue(lead.deal_value != null ? String(lead.deal_value) : ''); return }
                    if (num !== lead.deal_value) patchAndFlash({ deal_value: num }, 'deal_value')
                  }}
                  placeholder="0"
                  style={{
                    ...nativeSelectStyle(), width: '100%',
                    backgroundImage: 'none', paddingRight: 10,
                  }}
                />
                <SavedFlash show={savedField === 'deal_value'} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Follow-Up Date</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="date"
                  value={followUpValue}
                  onChange={e => setFollowUpValue(e.target.value)}
                  onBlur={() => {
                    const v = followUpValue || null
                    if (v !== lead.follow_up_date) patchAndFlash({ follow_up_date: v }, 'follow_up_date')
                  }}
                  style={{
                    ...nativeSelectStyle(), width: '100%',
                    backgroundImage: 'none', paddingRight: 10,
                  }}
                />
                <SavedFlash show={savedField === 'follow_up_date'} />
              </div>
            </div>
          </SidebarCard>

          {/* Lead source */}
          <SidebarCard title="Lead Source">
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Source Type</p>
              <select
                value={lead.lead_source_type ?? ''}
                onChange={e => {
                  const v = e.target.value || null
                  patchAndFlash({ lead_source_type: v }, 'source_type')
                }}
                style={nativeSelectStyle()}
              >
                <option value="">None</option>
                {(['story', 'reel', 'organic', 'manual'] as const).map(s => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
              <div style={{ height: 16, marginTop: 2 }}>
                <SavedFlash show={savedField === 'source_type'} />
              </div>
            </div>
            {lead.lead_source_id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link2 size={11} color="#4b5563" strokeWidth={2} />
                <span
                  style={{
                    fontSize: 11, color: '#6b7280',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {lead.lead_source_id}
                </span>
              </div>
            )}
          </SidebarCard>

          {/* Contact details */}
          <SidebarCard title="Contact">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Email */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <Mail size={10} color="#4b5563" strokeWidth={2} />
                  <span style={{ fontSize: 10.5, color: '#4b5563' }}>Email</span>
                  <SavedFlash show={savedField === 'email'} />
                </div>
                <input
                  type="email"
                  value={emailValue}
                  onChange={e => setEmailValue(e.target.value)}
                  onBlur={() => {
                    const v = emailValue.trim() || null
                    if (v !== lead.email) patchAndFlash({ email: v }, 'email')
                    else setEmailValue(lead.email ?? '')
                  }}
                  placeholder="email@example.com"
                  style={{
                    ...nativeSelectStyle(), width: '100%',
                    backgroundImage: 'none', paddingRight: 10,
                  }}
                />
              </div>
              {/* Phone */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <Phone size={10} color="#4b5563" strokeWidth={2} />
                  <span style={{ fontSize: 10.5, color: '#4b5563' }}>Phone</span>
                  <SavedFlash show={savedField === 'phone'} />
                </div>
                <input
                  type="tel"
                  value={phoneValue}
                  onChange={e => setPhoneValue(e.target.value)}
                  onBlur={() => {
                    const v = phoneValue.trim() || null
                    if (v !== lead.phone) patchAndFlash({ phone: v }, 'phone')
                    else setPhoneValue(lead.phone ?? '')
                  }}
                  placeholder="+1 (555) 000-0000"
                  style={{
                    ...nativeSelectStyle(), width: '100%',
                    backgroundImage: 'none', paddingRight: 10,
                  }}
                />
              </div>
            </div>
          </SidebarCard>

          {/* GHL card (read-only) */}
          {lead.ghl_contact_id && (
            <SidebarCard title="GoHighLevel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    border: '1px solid rgba(37,99,235,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <User size={13} color="#2563eb" strokeWidth={2} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#9ca3af' }}>Contact ID</p>
                  <p
                    style={{
                      fontSize: 10.5, color: '#4b5563', fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 180,
                    }}
                  >
                    {lead.ghl_contact_id}
                  </p>
                </div>
              </div>
            </SidebarCard>
          )}

          {/* Offer tier selector */}
          <SidebarCard title="Offer Tier">
            <select
              value={lead.offer_tier ?? ''}
              onChange={e => {
                const v = e.target.value || null
                patchAndFlash({ offer_tier: v as OfferTier | null }, 'offer_tier')
              }}
              style={nativeSelectStyle()}
            >
              <option value="">None</option>
              <option value="ht">High Ticket (HT)</option>
              <option value="mt">Mid Ticket (MT)</option>
              <option value="lt">Low Ticket (LT)</option>
            </select>
            <div style={{ height: 16, marginTop: 4 }}>
              <SavedFlash show={savedField === 'offer_tier'} />
            </div>
          </SidebarCard>

        </div>
      </div>

      <DisqualifyModal
        leadId={lead.id}
        leadName={lead.name}
        isOpen={disqualifyOpen}
        onClose={() => setDisqualifyOpen(false)}
        onComplete={() => router.push('/dashboard/crm')}
      />
    </>
  )
}
