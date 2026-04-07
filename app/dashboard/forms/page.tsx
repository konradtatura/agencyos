'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, Edit3, Phone, TrendingUp, ChevronRight,
  ClipboardList, Star, LayoutDashboard,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface EodSubmission {
  id: string
  for_date: string
  role: string
  // setter
  outbound_attempts?: number | null
  inbound_responses?: number | null
  booking_links_sent?: number | null
  good_convos?: number | null
  calls_booked?: number | null
  no_response_follows?: number | null
  top_3_wins?: string | null
  main_blocker?: string | null
  energy_level?: number | null
  notes_for_tomorrow?: string | null
  // closer
  scheduled_calls?: number | null
  calls_completed?: number | null
  no_shows?: number | null
  calls_closed?: number | null
  no_close_calls?: number | null
  rebooked_no_closes?: number | null
  disqualified?: number | null
  cash_collected?: number | null
  revenue_closed?: number | null
  payment_plans?: number | null
  full_pay?: number | null
  deposits_collected?: number | null
  no_close_reasons?: string | null
  no_show_reasons?: string | null
  coaching_needed_on?: string | null
  confidence_level?: number | null
  need_script_review?: boolean | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(label: string, val: unknown) {
  if (val == null || val === '') return null
  return { label, val: String(val) }
}

function fmtCurrency(val: number | null | undefined) {
  if (val == null) return null
  return `$${val.toLocaleString()}`
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">
      {children}
    </p>
  )
}

function NumberInput({
  label, name, value, onChange, prefix,
}: {
  label: string
  name: string
  value: string
  onChange: (name: string, val: string) => void
  prefix?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">
        {label}
      </label>
      <div className="flex items-center">
        {prefix && (
          <span
            className="flex h-11 items-center rounded-l-lg border-r px-3 text-[14px] text-[#6b7280]"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          className={`h-11 w-full bg-transparent px-3 text-[15px] font-semibold text-[#f9fafb] outline-none transition-colors placeholder:text-[#4b5563] focus:ring-1 focus:ring-[#2563eb] ${prefix ? 'rounded-r-lg' : 'rounded-lg'}`}
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          placeholder="0"
        />
      </div>
    </div>
  )
}

function TextArea({
  label, name, value, onChange, rows = 3,
}: {
  label: string
  name: string
  value: string
  onChange: (name: string, val: string) => void
  rows?: number
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full resize-none rounded-lg px-3 py-2.5 text-[13px] text-[#f9fafb] outline-none placeholder:text-[#4b5563] focus:ring-1 focus:ring-[#2563eb]"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        placeholder="..."
      />
    </div>
  )
}

function RatingInput({
  label, name, value, onChange,
}: {
  label: string
  name: string
  value: number
  onChange: (name: string, val: number) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-[12px] font-medium text-[#9ca3af]">
        {label} <span className="ml-1 text-[#f9fafb]">{value > 0 ? value : '—'}</span>
      </label>
      <div className="flex gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(name, n)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-semibold transition-all"
            style={
              value === n
                ? { backgroundColor: '#2563eb', color: '#fff' }
                : value > 0 && n <= value
                ? { backgroundColor: 'rgba(37,99,235,0.2)', color: '#60a5fa' }
                : { backgroundColor: 'rgba(255,255,255,0.04)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.06)' }
            }
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectInput({
  label, name, value, onChange, options,
}: {
  label: string
  name: string
  value: string
  onChange: (name: string, val: string) => void
  options: string[]
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="h-11 w-full rounded-lg px-3 text-[13px] text-[#f9fafb] outline-none focus:ring-1 focus:ring-[#2563eb]"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ backgroundColor: '#111827' }}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Submitted Banner ──────────────────────────────────────────────────────────

function SubmittedBanner({
  submission,
  role,
  onEdit,
}: {
  submission: EodSubmission
  role: 'setter' | 'closer'
  onEdit: () => void
}) {
  const items =
    role === 'setter'
      ? [
          fmt('Outbound Attempts', submission.outbound_attempts),
          fmt('Calls Booked', submission.calls_booked),
          fmt('Booking Links Sent', submission.booking_links_sent),
          fmt('Good Convos', submission.good_convos),
          fmt('Inbound Responses', submission.inbound_responses),
          fmt('No-Response Follows', submission.no_response_follows),
          fmt('Energy Level', submission.energy_level ? `${submission.energy_level}/10` : null),
          fmt('Top 3 Wins', submission.top_3_wins),
          fmt('Main Blocker', submission.main_blocker),
          fmt('Notes for Tomorrow', submission.notes_for_tomorrow),
        ].filter(Boolean)
      : [
          fmt('Scheduled Calls', submission.scheduled_calls),
          fmt('Calls Completed', submission.calls_completed),
          fmt('Calls Closed', submission.calls_closed),
          fmt('No-Shows', submission.no_shows),
          fmt('No-Close Calls', submission.no_close_calls),
          { label: 'Cash Collected', val: fmtCurrency(submission.cash_collected) },
          { label: 'Revenue Closed', val: fmtCurrency(submission.revenue_closed) },
          fmt('Confidence Level', submission.confidence_level ? `${submission.confidence_level}/10` : null),
          fmt('No-Close Reasons', submission.no_close_reasons),
          fmt('Coaching Needed On', submission.coaching_needed_on),
          fmt('Script Review Needed', submission.need_script_review ? 'Yes' : null),
        ].filter((i) => i && i.val)

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-3 rounded-xl p-4"
        style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[#10b981]" />
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#10b981]">Submitted today</p>
          <p className="text-[11px] text-[#6b7280]">{submission.for_date}</p>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:text-[#f9fafb]"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
        >
          <Edit3 className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      <Card>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">Your submission</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {(items as { label: string; val: string | null }[]).map((item) =>
            item && item.val ? (
              <div key={item.label}>
                <p className="text-[11px] text-[#6b7280]">{item.label}</p>
                <p className="text-[13px] font-medium text-[#f9fafb]">{item.val}</p>
              </div>
            ) : null
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Setter Form ───────────────────────────────────────────────────────────────

function SetterForm({
  user,
  existing,
  onSubmitted,
}: {
  user: UserProfile
  existing: EodSubmission | null
  onSubmitted: (s: EodSubmission) => void
}) {
  const [editing, setEditing] = useState(!existing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fields, setFields] = useState({
    for_date: existing?.for_date ?? todayStr(),
    outbound_attempts: String(existing?.outbound_attempts ?? ''),
    inbound_responses: String(existing?.inbound_responses ?? ''),
    booking_links_sent: String(existing?.booking_links_sent ?? ''),
    good_convos: String(existing?.good_convos ?? ''),
    calls_booked: String(existing?.calls_booked ?? ''),
    no_response_follows: String(existing?.no_response_follows ?? ''),
    top_3_wins: existing?.top_3_wins ?? '',
    main_blocker: existing?.main_blocker ?? '',
    energy_level: existing?.energy_level ?? 0,
    notes_for_tomorrow: existing?.notes_for_tomorrow ?? '',
  })

  const set = (name: string, val: string) => setFields((f) => ({ ...f, [name]: val }))
  const setNum = (name: string, val: number) => setFields((f) => ({ ...f, [name]: val }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/forms/eod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'setter',
          for_date: fields.for_date,
          outbound_attempts:   fields.outbound_attempts   !== '' ? Number(fields.outbound_attempts)   : null,
          inbound_responses:   fields.inbound_responses   !== '' ? Number(fields.inbound_responses)   : null,
          booking_links_sent:  fields.booking_links_sent  !== '' ? Number(fields.booking_links_sent)  : null,
          good_convos:         fields.good_convos         !== '' ? Number(fields.good_convos)         : null,
          calls_booked:        fields.calls_booked        !== '' ? Number(fields.calls_booked)        : null,
          no_response_follows: fields.no_response_follows !== '' ? Number(fields.no_response_follows) : null,
          top_3_wins:          fields.top_3_wins          || null,
          main_blocker:        fields.main_blocker        || null,
          energy_level:        fields.energy_level > 0    ? fields.energy_level                       : null,
          notes_for_tomorrow:  fields.notes_for_tomorrow  || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit')
      onSubmitted(data)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && existing) {
    return <SubmittedBanner submission={existing} role="setter" onEdit={() => setEditing(true)} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <SectionLabel>Date & Identity</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">Date</label>
            <input
              type="date"
              value={fields.for_date}
              onChange={(e) => set('for_date', e.target.value)}
              className="h-11 w-full rounded-lg px-3 text-[14px] text-[#f9fafb] outline-none focus:ring-1 focus:ring-[#2563eb]"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">Name</label>
            <input
              type="text"
              readOnly
              value={user.full_name ?? user.email}
              className="h-11 w-full cursor-not-allowed rounded-lg px-3 text-[14px] text-[#6b7280] outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionLabel>Activity Numbers</SectionLabel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumberInput label="Outbound Attempts"   name="outbound_attempts"   value={fields.outbound_attempts}   onChange={set} />
          <NumberInput label="Inbound Responses"   name="inbound_responses"   value={fields.inbound_responses}   onChange={set} />
          <NumberInput label="Booking Links Sent"  name="booking_links_sent"  value={fields.booking_links_sent}  onChange={set} />
          <NumberInput label="Good Convos Today"   name="good_convos"         value={fields.good_convos}         onChange={set} />
          <NumberInput label="Calls Booked"        name="calls_booked"        value={fields.calls_booked}        onChange={set} />
          <NumberInput label="No-Response Follows" name="no_response_follows" value={fields.no_response_follows} onChange={set} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Reflection</SectionLabel>
        <div className="space-y-4">
          <TextArea label="Top 3 Wins Today"       name="top_3_wins"          value={fields.top_3_wins}          onChange={set} rows={3} />
          <TextArea label="Main Blocker / Challenge" name="main_blocker"      value={fields.main_blocker}        onChange={set} rows={2} />
          <TextArea label="Notes for Tomorrow"     name="notes_for_tomorrow"  value={fields.notes_for_tomorrow}  onChange={set} rows={2} />
        </div>
      </Card>

      <Card>
        <RatingInput
          label="Energy Level (1–10)"
          name="energy_level"
          value={fields.energy_level}
          onChange={setNum}
        />
      </Card>

      {error && (
        <p className="rounded-lg px-4 py-3 text-[13px] text-[#ef4444]" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl py-3.5 text-[14px] font-semibold text-white transition-all disabled:opacity-50"
        style={{ backgroundColor: '#2563eb' }}
      >
        {saving ? 'Submitting…' : existing ? 'Update Submission' : 'Submit EOD Report'}
      </button>
    </form>
  )
}

// ── Closer Form ───────────────────────────────────────────────────────────────

const NO_CLOSE_OPTIONS  = ['Not Qualified', 'Price Objection', 'Needs Time', 'Ghosted', 'Other']
const NO_SHOW_OPTIONS   = ['No Reminder', 'Wrong Time', 'Not Serious', 'Other']

function CloserForm({
  user,
  existing,
  onSubmitted,
}: {
  user: UserProfile
  existing: EodSubmission | null
  onSubmitted: (s: EodSubmission) => void
}) {
  const [editing, setEditing] = useState(!existing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fields, setFields] = useState({
    for_date:           existing?.for_date        ?? todayStr(),
    scheduled_calls:    String(existing?.scheduled_calls    ?? ''),
    calls_completed:    String(existing?.calls_completed    ?? ''),
    no_shows:           String(existing?.no_shows           ?? ''),
    calls_closed:       String(existing?.calls_closed       ?? ''),
    no_close_calls:     String(existing?.no_close_calls     ?? ''),
    rebooked_no_closes: String(existing?.rebooked_no_closes ?? ''),
    disqualified:       String(existing?.disqualified       ?? ''),
    cash_collected:     String(existing?.cash_collected     ?? ''),
    revenue_closed:     String(existing?.revenue_closed     ?? ''),
    payment_plans:      String(existing?.payment_plans      ?? ''),
    full_pay:           String(existing?.full_pay           ?? ''),
    deposits_collected: String(existing?.deposits_collected ?? ''),
    no_close_reasons:   existing?.no_close_reasons  ?? '',
    no_show_reasons:    existing?.no_show_reasons   ?? '',
    coaching_needed_on: existing?.coaching_needed_on ?? '',
    confidence_level:   existing?.confidence_level  ?? 0,
    need_script_review: existing?.need_script_review ?? false,
  })

  const set    = (name: string, val: string)  => setFields((f) => ({ ...f, [name]: val }))
  const setNum = (name: string, val: number)  => setFields((f) => ({ ...f, [name]: val }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const numericFields = [
        'scheduled_calls', 'calls_completed', 'no_shows', 'calls_closed',
        'no_close_calls', 'rebooked_no_closes', 'disqualified', 'cash_collected',
        'revenue_closed', 'payment_plans', 'full_pay', 'deposits_collected',
      ] as const
      const body: Record<string, unknown> = {
        role: 'closer',
        for_date:           fields.for_date,
        no_close_reasons:   fields.no_close_reasons   || null,
        no_show_reasons:    fields.no_show_reasons     || null,
        coaching_needed_on: fields.coaching_needed_on  || null,
        confidence_level:   fields.confidence_level > 0 ? fields.confidence_level : null,
        need_script_review: fields.need_script_review,
      }
      for (const k of numericFields) {
        body[k] = fields[k] !== '' ? Number(fields[k]) : null
      }
      const res = await fetch('/api/forms/eod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit')
      onSubmitted(data)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && existing) {
    return <SubmittedBanner submission={existing} role="closer" onEdit={() => setEditing(true)} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <SectionLabel>Date & Identity</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">Date</label>
            <input
              type="date"
              value={fields.for_date}
              onChange={(e) => set('for_date', e.target.value)}
              className="h-11 w-full rounded-lg px-3 text-[14px] text-[#f9fafb] outline-none focus:ring-1 focus:ring-[#2563eb]"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">Name</label>
            <input
              type="text"
              readOnly
              value={user.full_name ?? user.email}
              className="h-11 w-full cursor-not-allowed rounded-lg px-3 text-[14px] text-[#6b7280] outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionLabel>Call Activity</SectionLabel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberInput label="Scheduled Calls"    name="scheduled_calls"    value={fields.scheduled_calls}    onChange={set} />
          <NumberInput label="Calls Completed"    name="calls_completed"    value={fields.calls_completed}    onChange={set} />
          <NumberInput label="No-Shows"           name="no_shows"           value={fields.no_shows}           onChange={set} />
          <NumberInput label="Calls Closed"       name="calls_closed"       value={fields.calls_closed}       onChange={set} />
          <NumberInput label="No-Close Calls"     name="no_close_calls"     value={fields.no_close_calls}     onChange={set} />
          <NumberInput label="Rebooked No-Closes" name="rebooked_no_closes" value={fields.rebooked_no_closes} onChange={set} />
          <NumberInput label="Disqualified"       name="disqualified"       value={fields.disqualified}       onChange={set} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Revenue</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberInput label="Cash Collected Today"  name="cash_collected"     value={fields.cash_collected}     onChange={set} prefix="$" />
          <NumberInput label="Revenue Closed Today"  name="revenue_closed"     value={fields.revenue_closed}     onChange={set} prefix="$" />
          <NumberInput label="Deposits Collected"    name="deposits_collected" value={fields.deposits_collected} onChange={set} prefix="$" />
          <NumberInput label="Payment Plans"         name="payment_plans"      value={fields.payment_plans}      onChange={set} />
          <NumberInput label="Full Pay"              name="full_pay"           value={fields.full_pay}           onChange={set} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Reasons & Notes</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectInput label="Main No-Close Reasons" name="no_close_reasons" value={fields.no_close_reasons} onChange={set} options={NO_CLOSE_OPTIONS} />
          <SelectInput label="Main No-Show Reasons"  name="no_show_reasons"  value={fields.no_show_reasons}  onChange={set} options={NO_SHOW_OPTIONS}   />
        </div>
        <div className="mt-4">
          <TextArea label="Coaching Needed On" name="coaching_needed_on" value={fields.coaching_needed_on} onChange={set} rows={2} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <input
            id="script-review"
            type="checkbox"
            checked={fields.need_script_review}
            onChange={(e) => setFields((f) => ({ ...f, need_script_review: e.target.checked }))}
            className="h-4 w-4 rounded"
            style={{ accentColor: '#2563eb' }}
          />
          <label htmlFor="script-review" className="text-[13px] text-[#9ca3af]">
            Need Script Review?
          </label>
        </div>
      </Card>

      <Card>
        <RatingInput
          label="Confidence Level (1–10)"
          name="confidence_level"
          value={fields.confidence_level}
          onChange={setNum}
        />
      </Card>

      {error && (
        <p className="rounded-lg px-4 py-3 text-[13px] text-[#ef4444]" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl py-3.5 text-[14px] font-semibold text-white transition-all disabled:opacity-50"
        style={{ backgroundColor: '#2563eb' }}
      >
        {saving ? 'Submitting…' : existing ? 'Update Submission' : 'Submit EOD Report'}
      </button>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'setter' | 'closer' | 'dashboard'

export default function DailyFormsPage() {
  const [user, setUser]         = useState<UserProfile | null>(null)
  const [tab, setTab]           = useState<Tab>('setter')
  const [loading, setLoading]   = useState(true)
  const [setterSub, setSetterSub] = useState<EodSubmission | null>(null)
  const [closerSub, setCloserSub] = useState<EodSubmission | null>(null)

  const today = todayStr()

  const fetchSubmissions = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch(`/api/forms/eod?date=${today}&role=setter`).then((r) => r.json()),
      fetch(`/api/forms/eod?date=${today}&role=closer`).then((r) => r.json()),
    ])
    setSetterSub(s ?? null)
    setCloserSub(c ?? null)
  }, [today])

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: profile } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('id', authUser.id)
        .single()

      if (profile) {
        setUser(profile as UserProfile)
        // Auto-select tab based on role
        if (profile.role === 'closer') setTab('closer')
        else setTab('setter')
      }

      await fetchSubmissions()
      setLoading(false)
    }
    init()
  }, [fetchSubmissions])

  const isCreatorOrAdmin = user?.role === 'creator' || user?.role === 'super_admin'
  const canSeeSetter = isCreatorOrAdmin || user?.role === 'setter'
  const canSeeCloser = isCreatorOrAdmin || user?.role === 'closer'

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(canSeeSetter ? [{ id: 'setter' as Tab, label: 'Setter EOD', icon: <TrendingUp className="h-4 w-4" /> }] : []),
    ...(canSeeCloser ? [{ id: 'closer' as Tab, label: 'Closer EOD', icon: <Phone className="h-4 w-4" /> }] : []),
    ...(isCreatorOrAdmin ? [{ id: 'dashboard' as Tab, label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> }] : []),
  ]

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563eb] border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="h-5 w-5 text-[#2563eb]" />
          <h1 className="text-[22px] font-bold text-[#f9fafb]">Daily Forms</h1>
        </div>
        <p className="text-[13px] text-[#6b7280]">End-of-day reporting for setters and closers</p>
      </div>

      {/* Tabs */}
      <div
        className="mb-8 flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'dashboard') {
                window.location.href = '/dashboard/forms/dashboard'
              } else {
                setTab(t.id)
              }
            }}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all"
            style={
              tab === t.id
                ? { backgroundColor: '#2563eb', color: '#fff' }
                : { color: '#9ca3af' }
            }
          >
            {t.icon}
            {t.label}
            {t.id === 'setter' && setterSub && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            )}
            {t.id === 'closer' && closerSub && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            )}
          </button>
        ))}
      </div>

      {/* Form content */}
      <div className="max-w-2xl">
        {tab === 'setter' && user && (
          <SetterForm
            user={user}
            existing={setterSub}
            onSubmitted={(s) => setSetterSub(s)}
          />
        )}
        {tab === 'closer' && user && (
          <CloserForm
            user={user}
            existing={closerSub}
            onSubmitted={(s) => setCloserSub(s)}
          />
        )}
      </div>
    </div>
  )
}
