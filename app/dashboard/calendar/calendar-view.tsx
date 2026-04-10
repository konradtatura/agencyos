'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X, RefreshCw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id:                  string
  name:                string
  ig_handle:           string | null
  stage:               string
  offer_tier:          string | null
  booked_at:           string
  deal_value:          number | null
  assigned_closer_id:  string | null
  closer:              { full_name: string | null } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STAGE_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  call_booked: { bg: 'rgba(37,99,235,0.2)',   text: '#60a5fa', dot: '#2563eb',  label: 'Call Booked'  },
  showed:      { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', dot: '#f59e0b',  label: 'Showed'       },
  closed_won:  { bg: 'rgba(16,185,129,0.15)', text: '#34d399', dot: '#10b981',  label: 'Closed Won'   },
  closed_lost: { bg: 'rgba(239,68,68,0.12)',  text: '#f87171', dot: '#ef4444',  label: 'Closed Lost'  },
}

const TIER_STYLE: Record<string, { bg: string; text: string }> = {
  ht: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
  mt: { bg: 'rgba(37,99,235,0.15)',  text: '#60a5fa' },
  lt: { bg: 'rgba(16,185,129,0.15)', text: '#34d399' },
}

const TIER_LABEL: Record<string, string> = { ht: 'HT', mt: 'MT', lt: 'LT' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Returns YYYY-MM-DD string in local time (avoids UTC-shift issues) */
function toDateKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Build array of {date, isCurrentMonth} for the calendar grid (always 6 rows × 7 cols) */
function buildGrid(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const firstOfMonth = new Date(year, month, 1)
  // JS: 0=Sun, 1=Mon … we want Mon=0
  const startDow = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: { date: Date; isCurrentMonth: boolean }[] = []

  // Previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month, -i), isCurrentMonth: false })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }
  // Next month fill to complete grid (always 42 cells)
  let next = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, next++), isCurrentMonth: false })
  }

  return cells
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const s = STAGE_STYLE[stage] ?? STAGE_STYLE.call_booked
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_STYLE[tier.toLowerCase()] ?? TIER_STYLE.lt
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: t.bg, color: t.text }}
    >
      {TIER_LABEL[tier.toLowerCase()] ?? tier.toUpperCase()}
    </span>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col"
        style={{
          backgroundColor: '#111827',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[16px] font-semibold leading-snug text-[#f9fafb]">{lead.name}</p>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-[#6b7280] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            <StageBadge stage={lead.stage} />
            {lead.offer_tier && <TierBadge tier={lead.offer_tier} />}
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <Field label="Booked At" value={fmtDateTime(lead.booked_at)} />
            <Field label="Closer" value={lead.closer?.full_name ?? 'Unassigned'} />
            {lead.deal_value != null && (
              <Field label="Deal Value" value={fmtUSD(lead.deal_value)} mono />
            )}
            {lead.ig_handle && (
              <Field label="Instagram" value={`@${lead.ig_handle}`} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <a
            href={`/dashboard/crm/${lead.id}`}
            className="flex w-full items-center justify-center rounded-xl py-2.5 text-[13.5px] font-semibold text-white transition-colors"
            style={{ backgroundColor: '#2563eb' }}
          >
            View Lead
          </a>
        </div>
      </div>
    </>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">{label}</p>
      <p className={`text-[13.5px] text-[#d1d5db] ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarView({ leads }: { leads: Lead[] }) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    const dow = (d.getDay() + 6) % 7 // Mon=0
    d.setDate(d.getDate() - dow)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [selected, setSelected] = useState<Lead | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [selectedClosers, setSelectedClosers] = useState<Set<string>>(new Set(['all']))
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(['ht', 'mt', 'lt']))

  // ── Derived ──────────────────────────────────────────────────────────────────

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(viewDate)
    d.setDate(viewDate.getDate() + i)
    return d
  })

  const HOURS = Array.from({ length: 16 }, (_, i) => i + 6)
  const HOUR_HEIGHT = 64

  const closers = Array.from(
    new Map(
      leads
        .filter(l => l.closer?.full_name)
        .map(l => [l.assigned_closer_id!, l.closer!.full_name!])
    ).entries()
  ).map(([id, name]) => ({ id, name }))

  const filteredLeads = leads.filter(l => {
    if (!l.booked_at) return false
    const tierOk = !l.offer_tier || selectedTiers.has(l.offer_tier)
    const closerOk = selectedClosers.has('all') ||
      (l.assigned_closer_id ? selectedClosers.has(l.assigned_closer_id) : true)
    return tierOk && closerOk
  })

  function getLeadsForSlot(day: Date, hour: number): Lead[] {
    return filteredLeads.filter(l => {
      const d = new Date(l.booked_at!)
      return d.getFullYear() === day.getFullYear() &&
        d.getMonth() === day.getMonth() &&
        d.getDate() === day.getDate() &&
        d.getHours() === hour
    })
  }

  function prevWeek() {
    setViewDate(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })
  }
  function nextWeek() {
    setViewDate(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })
  }
  function goToToday() {
    const d = new Date()
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    d.setHours(0, 0, 0, 0)
    setViewDate(d)
  }

  const weekEnd = new Date(viewDate)
  weekEnd.setDate(viewDate.getDate() + 6)
  const weekLabel = `${viewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  function dayKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const now = new Date()
  const currentMinutesFrom6am = (now.getHours() - 6) * 60 + now.getMinutes()
  const showCurrentTime = currentMinutesFrom6am >= 0 && currentMinutesFrom6am <= 16 * 60

  const monthLeads = leads.filter(l => {
    if (!l.booked_at) return false
    const d = new Date(l.booked_at)
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
  })
  const callsCount  = monthLeads.length
  const showedCount = monthLeads.filter(l => ['showed', 'closed_won', 'closed_lost'].includes(l.stage)).length
  const closedCount = monthLeads.filter(l => l.stage === 'closed_won').length

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: '80vh' }}>
      {/* ── Main calendar area ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevWeek} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', minWidth: 200, textAlign: 'center' }}>
              {weekLabel}
            </span>
            <button onClick={nextWeek} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <button onClick={goToToday} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#9ca3af', fontSize: 12.5, cursor: 'pointer' }}>
            Today
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatPill label={`${callsCount} calls this month`} color="#60a5fa" bg="rgba(37,99,235,0.12)" />
            <StatPill label={`${showedCount} showed`} color="#fbbf24" bg="rgba(245,158,11,0.12)" />
            <StatPill label={`${closedCount} closed`} color="#34d399" bg="rgba(16,185,129,0.12)" />
            <button
              onClick={async () => {
                setSyncing(true); setSyncMsg(null)
                try {
                  const res = await fetch('/api/ghl/sync-appointments', { method: 'POST' })
                  const data = await res.json() as { synced?: number; error?: string }
                  if (res.ok) { setSyncMsg(`Synced ${data.synced}`); window.location.reload() }
                  else setSyncMsg(data.error ?? 'Sync failed')
                } catch { setSyncMsg('Network error') }
                finally { setSyncing(false) }
              }}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(37,99,235,0.2)', backgroundColor: 'rgba(37,99,235,0.15)', color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: syncing ? 0.5 : 1 }}
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync GHL'}
            </button>
          </div>
        </div>

        {syncMsg && <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{syncMsg}</p>}

        {/* Calendar grid */}
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>

          {/* Day headers row */}
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', backgroundColor: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div />
            {weekDays.map((day, i) => {
              const isToday = dayKey(day) === todayStr
              return (
                <div key={i} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <p style={{
                    fontSize: 20, fontWeight: 700, lineHeight: 1,
                    color: isToday ? '#fff' : '#9ca3af',
                    width: 34, height: 34, borderRadius: '50%', margin: '0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isToday ? '#2563eb' : 'transparent',
                  }}>
                    {day.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Time grid — scrollable */}
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', position: 'relative', backgroundColor: '#111827' }}>

            {/* Current time line */}
            {showCurrentTime && (
              <div style={{
                position: 'absolute',
                top: currentMinutesFrom6am * (HOUR_HEIGHT / 60),
                left: 56,
                right: 0,
                height: 2,
                backgroundColor: '#ef4444',
                zIndex: 10,
                pointerEvents: 'none',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444', position: 'absolute', left: -4, top: -3 }} />
              </div>
            )}

            {HOURS.map((hour) => (
              <div key={hour} style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', minHeight: HOUR_HEIGHT, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ padding: '4px 8px', fontSize: 11, color: '#374151', textAlign: 'right', paddingTop: 6, flexShrink: 0 }}>
                  {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                </div>

                {weekDays.map((day, di) => {
                  const slotLeads = getLeadsForSlot(day, hour)
                  const isToday = dayKey(day) === todayStr
                  return (
                    <div key={di} style={{
                      borderLeft: '1px solid rgba(255,255,255,0.04)',
                      position: 'relative',
                      padding: 2,
                      backgroundColor: isToday ? 'rgba(37,99,235,0.02)' : 'transparent',
                    }}>
                      {slotLeads.map((lead) => {
                        const s = STAGE_STYLE[lead.stage] ?? STAGE_STYLE.call_booked
                        const t = lead.offer_tier ? TIER_LABEL[lead.offer_tier] : null
                        const time = new Date(lead.booked_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        return (
                          <button
                            key={lead.id}
                            onClick={() => setSelected(lead)}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '4px 6px', borderRadius: 6, marginBottom: 2,
                              backgroundColor: s.bg,
                              border: `1px solid ${s.dot}30`,
                              cursor: 'pointer', minHeight: 48,
                            }}
                          >
                            <p style={{ fontSize: 11.5, fontWeight: 700, color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.name}
                            </p>
                            <p style={{ fontSize: 10, color: `${s.text}99`, marginTop: 1 }}>{time}{t ? ` · ${t}` : ''}</p>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div style={{ width: 200, flexShrink: 0, marginLeft: 16, padding: '0 0 0 16px', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>Manage View</p>

        {/* Closers filter */}
        {closers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Closers</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedClosers.has('all')}
                onChange={() => {
                  setSelectedClosers(selectedClosers.has('all')
                    ? new Set(closers.map(c => c.id))
                    : new Set(['all']))
                }}
                style={{ accentColor: '#2563eb' }}
              />
              <span style={{ fontSize: 12.5, color: '#9ca3af' }}>All Closers</span>
            </label>
            {closers.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedClosers.has('all') || selectedClosers.has(c.id)}
                  onChange={() => {
                    if (selectedClosers.has('all')) {
                      const next = new Set(closers.map(x => x.id))
                      next.delete(c.id)
                      setSelectedClosers(next)
                    } else {
                      const next = new Set(selectedClosers)
                      if (next.has(c.id)) next.delete(c.id)
                      else next.add(c.id)
                      if (next.size === closers.length) next.add('all')
                      setSelectedClosers(next)
                    }
                  }}
                  style={{ accentColor: '#2563eb' }}
                />
                <span style={{ fontSize: 12.5, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </label>
            ))}
          </div>
        )}

        {/* Tier filter */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Offer Tier</p>
          {[
            { key: 'ht', label: 'High Ticket', color: '#a78bfa' },
            { key: 'mt', label: 'Mid Ticket',  color: '#60a5fa' },
            { key: 'lt', label: 'Low Ticket',  color: '#34d399' },
          ].map(t => (
            <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedTiers.has(t.key)}
                onChange={() => {
                  const next = new Set(selectedTiers)
                  if (next.has(t.key)) next.delete(t.key)
                  else next.add(t.key)
                  setSelectedTiers(next)
                }}
                style={{ accentColor: t.color }}
              />
              <span style={{ fontSize: 12.5, color: '#9ca3af' }}>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected && <DetailPanel lead={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-[12px] font-semibold"
      style={{ backgroundColor: bg, color }}
    >
      {label}
    </span>
  )
}
