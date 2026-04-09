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
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<Lead | null>(null)
  const [syncing,  setSyncing]  = useState(false)
  const [syncMsg,  setSyncMsg]  = useState<string | null>(null)

  // ── Derived ──────────────────────────────────────────────────────────────────

  // Map: YYYY-MM-DD → Lead[]
  const leadsByDate = new Map<string, Lead[]>()
  for (const lead of leads) {
    const key = toDateKey(lead.booked_at)
    const arr = leadsByDate.get(key) ?? []
    arr.push(lead)
    leadsByDate.set(key, arr)
  }

  const grid = buildGrid(year, month)
  const todayKey = dateKey(today)

  // Stats for current month
  const monthLeads = leads.filter((l) => {
    const d = new Date(l.booked_at)
    return d.getFullYear() === year && d.getMonth() === month
  })
  const callsCount  = monthLeads.length
  const showedCount = monthLeads.filter((l) => l.stage === 'showed' || l.stage === 'closed_won' || l.stage === 'closed_lost').length
  const closedCount = monthLeads.filter((l) => l.stage === 'closed_won').length

  // ── Navigation ───────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="min-w-[160px] text-center text-[22px] font-bold text-[#f9fafb]">
            {monthLabel}
          </span>

          <button
            onClick={nextMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
          className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Today
        </button>

        {/* Stat pills + sync button */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StatPill label={`${callsCount} call${callsCount !== 1 ? 's' : ''} this month`} color="#60a5fa" bg="rgba(37,99,235,0.12)" />
          <StatPill label={`${showedCount} showed`} color="#fbbf24" bg="rgba(245,158,11,0.12)" />
          <StatPill label={`${closedCount} closed`} color="#34d399" bg="rgba(16,185,129,0.12)" />
          <button
            onClick={async () => {
              setSyncing(true)
              setSyncMsg(null)
              try {
                const res = await fetch('/api/ghl/sync-appointments', { method: 'POST' })
                const data = await res.json() as { synced?: number; error?: string }
                if (res.ok) {
                  setSyncMsg(`Synced ${data.synced} appointments`)
                  window.location.reload()
                } else {
                  setSyncMsg(data.error ?? 'Sync failed')
                }
              } catch {
                setSyncMsg('Network error')
              } finally {
                setSyncing(false)
              }
            }}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.2)' }}
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync GHL'}
          </button>
        </div>
      </div>
      {syncMsg && (
        <p className="mb-4 text-[12px] text-[#9ca3af]">{syncMsg}</p>
      )}

      {/* ── Calendar grid ────────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ backgroundColor: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7" style={{ backgroundColor: '#111827' }}>
          {grid.map((cell, i) => {
            const key = dateKey(cell.date)
            const isToday = key === todayKey
            const cellLeads = leadsByDate.get(key) ?? []
            const shown = cellLeads.slice(0, 2)
            const overflow = cellLeads.length - 2

            return (
              <div
                key={i}
                className="min-h-[100px] p-2"
                style={{
                  borderRight:  (i % 7) < 6 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                  borderBottom: i < 35       ? '1px solid rgba(255,255,255,0.04)' : undefined,
                  backgroundColor: isToday ? 'rgba(37,99,235,0.06)' : undefined,
                  ...(isToday ? { outline: '1px solid #2563eb', outlineOffset: '-1px' } : {}),
                }}
              >
                {/* Date number */}
                <p
                  className="mb-1.5 text-[12px] font-medium"
                  style={{ color: !cell.isCurrentMonth ? '#374151' : isToday ? '#60a5fa' : '#9ca3af' }}
                >
                  {cell.date.getDate()}
                </p>

                {/* Event chips */}
                <div className="space-y-1">
                  {shown.map((lead) => {
                    const s = STAGE_STYLE[lead.stage] ?? STAGE_STYLE.call_booked
                    return (
                      <button
                        key={lead.id}
                        onClick={() => setSelected(lead)}
                        className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80"
                        style={{ backgroundColor: s.bg, color: s.text }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.dot }} />
                        <span className="truncate">
                          {lead.name.length > 14 ? lead.name.slice(0, 14) + '…' : lead.name}
                        </span>
                      </button>
                    )
                  })}
                  {overflow > 0 && (
                    <p className="pl-1.5 text-[11px] text-white/40">+{overflow} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {callsCount === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 pt-32">
          <Calendar className="h-10 w-10 text-[#374151]" />
          <p className="text-[14px] text-[#4b5563]">No calls booked this month</p>
        </div>
      )}

      {/* ── Detail panel ──────────────────────────────────────────────── */}
      {selected && (
        <DetailPanel lead={selected} onClose={() => setSelected(null)} />
      )}
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
