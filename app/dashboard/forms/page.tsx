'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, Edit3, Phone, TrendingUp,
  ClipboardList, LayoutDashboard,
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
  calls_booked?: number | null
  outbound_sent?: number | null
  inbound_received?: number | null
  outbound_booked_q?: number | null
  inbound_booked_q?: number | null
  dq_forms?: number | null
  booking_links_sent?: number | null
  downsell_cash?: number | null
  // closer
  showed?: number | null
  canceled?: number | null
  disqualified?: number | null
  rescheduled?: number | null
  followup_shown?: number | null
  followup_closed?: number | null
  closes?: number | null
  cash_collected?: number | null
  revenue?: number | null
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
          fmt('Calls Booked', submission.calls_booked),
          fmt('Outbound Sent', submission.outbound_sent),
          fmt('Inbound Received', submission.inbound_received),
          fmt('Outbound Booked (Q)', submission.outbound_booked_q),
          fmt('Inbound Booked (Q)', submission.inbound_booked_q),
          fmt('DQ Forms', submission.dq_forms),
          fmt('Booking Links Sent', submission.booking_links_sent),
          { label: 'Downsell Cash', val: fmtCurrency(submission.downsell_cash) },
        ].filter(Boolean)
      : [
          fmt('Calls Booked', submission.calls_booked),
          fmt('Showed', submission.showed),
          fmt('Canceled', submission.canceled),
          fmt('Disqualified', submission.disqualified),
          fmt('Rescheduled', submission.rescheduled),
          fmt('Follow-up Shown', submission.followup_shown),
          fmt('Follow-up Closed', submission.followup_closed),
          fmt('Closes', submission.closes),
          { label: 'Cash Collected', val: fmtCurrency(submission.cash_collected) },
          { label: 'Revenue', val: fmtCurrency(submission.revenue) },
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
    for_date:          existing?.for_date          ?? todayStr(),
    calls_booked:      String(existing?.calls_booked      ?? ''),
    outbound_sent:     String(existing?.outbound_sent     ?? ''),
    inbound_received:  String(existing?.inbound_received  ?? ''),
    outbound_booked_q: String(existing?.outbound_booked_q ?? ''),
    inbound_booked_q:  String(existing?.inbound_booked_q  ?? ''),
    dq_forms:          String(existing?.dq_forms          ?? ''),
    booking_links_sent: String(existing?.booking_links_sent ?? ''),
    downsell_cash:     String(existing?.downsell_cash     ?? ''),
  })

  const set = (name: string, val: string) => setFields((f) => ({ ...f, [name]: val }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const numericFields = [
      'calls_booked', 'outbound_sent', 'inbound_received', 'outbound_booked_q',
      'inbound_booked_q', 'dq_forms', 'booking_links_sent', 'downsell_cash',
    ] as const
    const body: Record<string, unknown> = { role: 'setter', for_date: fields.for_date }
    for (const k of numericFields) {
      body[k] = fields[k] !== '' ? Number(fields[k]) : null
    }
    try {
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
          <NumberInput label="Calls Booked"         name="calls_booked"       value={fields.calls_booked}       onChange={set} />
          <NumberInput label="Outbound Sent"         name="outbound_sent"      value={fields.outbound_sent}      onChange={set} />
          <NumberInput label="Inbound Received"      name="inbound_received"   value={fields.inbound_received}   onChange={set} />
          <NumberInput label="Outbound Booked (Q)"   name="outbound_booked_q"  value={fields.outbound_booked_q}  onChange={set} />
          <NumberInput label="Inbound Booked (Q)"    name="inbound_booked_q"   value={fields.inbound_booked_q}   onChange={set} />
          <NumberInput label="DQ Forms Submitted"    name="dq_forms"           value={fields.dq_forms}           onChange={set} />
          <NumberInput label="Booking Links Sent"    name="booking_links_sent" value={fields.booking_links_sent} onChange={set} />
          <NumberInput label="$ Downsell Cash"       name="downsell_cash"      value={fields.downsell_cash}      onChange={set} prefix="$" />
        </div>
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
    for_date:        existing?.for_date        ?? todayStr(),
    calls_booked:    String(existing?.calls_booked    ?? ''),
    showed:          String(existing?.showed          ?? ''),
    canceled:        String(existing?.canceled        ?? ''),
    disqualified:    String(existing?.disqualified    ?? ''),
    rescheduled:     String(existing?.rescheduled     ?? ''),
    followup_shown:  String(existing?.followup_shown  ?? ''),
    followup_closed: String(existing?.followup_closed ?? ''),
    closes:          String(existing?.closes          ?? ''),
    cash_collected:  String(existing?.cash_collected  ?? ''),
    revenue:         String(existing?.revenue         ?? ''),
  })

  const set = (name: string, val: string) => setFields((f) => ({ ...f, [name]: val }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const numericFields = [
      'calls_booked', 'showed', 'canceled', 'disqualified', 'rescheduled',
      'followup_shown', 'followup_closed', 'closes', 'cash_collected', 'revenue',
    ] as const
    const body: Record<string, unknown> = { role: 'closer', for_date: fields.for_date }
    for (const k of numericFields) {
      body[k] = fields[k] !== '' ? Number(fields[k]) : null
    }
    try {
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
          <NumberInput label="Calls Booked"      name="calls_booked"    value={fields.calls_booked}    onChange={set} />
          <NumberInput label="Showed"            name="showed"          value={fields.showed}          onChange={set} />
          <NumberInput label="Canceled"          name="canceled"        value={fields.canceled}        onChange={set} />
          <NumberInput label="Disqualified"      name="disqualified"    value={fields.disqualified}    onChange={set} />
          <NumberInput label="Rescheduled"       name="rescheduled"     value={fields.rescheduled}     onChange={set} />
          <NumberInput label="Follow-up Shown"   name="followup_shown"  value={fields.followup_shown}  onChange={set} />
          <NumberInput label="Follow-up Closed"  name="followup_closed" value={fields.followup_closed} onChange={set} />
          <NumberInput label="Closes (original)" name="closes"          value={fields.closes}          onChange={set} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Revenue</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberInput label="Cash Collected" name="cash_collected" value={fields.cash_collected} onChange={set} prefix="$" />
          <NumberInput label="Revenue"        name="revenue"        value={fields.revenue}        onChange={set} prefix="$" />
        </div>
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
