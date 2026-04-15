'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2, X } from 'lucide-react'
import type { FunnelSnapshot } from '@/types/revenue'

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtPct(num: number, denom: number) {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const INPUT = 'w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none focus:ring-1 focus:ring-[#2563eb] transition-colors placeholder:text-[#4b5563]'
const INPUT_STYLE = { backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
const LABEL = 'mb-1.5 block text-[12px] font-medium text-[#9ca3af]'

interface SnapshotForm {
  funnel_name: string
  date_from: string
  date_to: string
  meta_spend: string
  meta_impressions: string
  meta_clicks: string
  lp_views: string
  opt_ins: string
  application_views: string
  applications: string
  book_call_views: string
  calls_booked_paid: string
  calls_booked_crm: string
  downsell1_views: string
  downsell1_clicks: string
  downsell2_views: string
  downsell2_clicks: string
  total_revenue: string
  notes: string
}

const EMPTY_FORM: SnapshotForm = {
  funnel_name: '', date_from: '', date_to: '',
  meta_spend: '', meta_impressions: '', meta_clicks: '',
  lp_views: '', opt_ins: '',
  application_views: '', applications: '',
  book_call_views: '', calls_booked_paid: '', calls_booked_crm: '',
  downsell1_views: '', downsell1_clicks: '',
  downsell2_views: '', downsell2_clicks: '',
  total_revenue: '', notes: '',
}

function num(s: string) { const n = Number(s); return isNaN(n) ? 0 : n }

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-right text-[12px] text-[#9ca3af]">{label}</span>
      <div className="flex-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', height: 8 }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 text-right font-mono text-[12px] font-semibold text-[#d1d5db]">
        {value.toLocaleString()}
      </span>
    </div>
  )
}

export default function FunnelPage() {
  const [snapshots, setSnapshots] = useState<FunnelSnapshot[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState<SnapshotForm>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [selected,  setSelected]  = useState<FunnelSnapshot | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/revenue/funnel-snapshots')
    const data = await res.json()
    const arr  = Array.isArray(data) ? data : []
    setSnapshots(arr)
    if (arr.length > 0 && !selected) setSelected(arr[0])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function setField(k: keyof SnapshotForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) {
        if (v === '') { body[k] = null; continue }
        const isNumField = !['funnel_name', 'date_from', 'date_to', 'notes'].includes(k)
        body[k] = isNumField ? Number(v) : v
      }
      const res  = await fetch('/api/revenue/funnel-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error ?? 'Save failed'); return }
      setForm(EMPTY_FORM)
      setShowForm(false)
      await load()
      setSelected(json)
    } catch {
      setFormError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/revenue/funnel-snapshots/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (selected?.id === id) setSelected(null)
    load()
  }

  const s = selected

  // Auto-calculations from form for live preview
  const liveCtr   = form.meta_clicks && form.meta_impressions
    ? fmtPct(num(form.meta_clicks), num(form.meta_impressions)) : null
  const liveOptIn = form.opt_ins && form.lp_views
    ? fmtPct(num(form.opt_ins), num(form.lp_views)) : null
  const liveApply = form.applications && form.application_views
    ? fmtPct(num(form.applications), num(form.application_views)) : null
  const liveBook  = (form.calls_booked_paid || form.calls_booked_crm) && form.book_call_views
    ? fmtPct(num(form.calls_booked_paid) + num(form.calls_booked_crm), num(form.book_call_views)) : null

  const topValue = s
    ? Math.max(s.lp_views ?? 0, s.opt_ins ?? 0, s.application_views ?? 0,
        s.applications ?? 0, s.book_call_views ?? 0,
        (s.calls_booked_paid ?? 0) + (s.calls_booked_crm ?? 0))
    : 1

  const FUNNEL_STEPS = s ? [
    { label: 'LP Views',       value: s.lp_views          ?? 0, color: '#6366f1' },
    { label: 'Opt-Ins',        value: s.opt_ins           ?? 0, color: '#8b5cf6' },
    { label: 'App Views',      value: s.application_views ?? 0, color: '#2563eb' },
    { label: 'Applications',   value: s.applications      ?? 0, color: '#0ea5e9' },
    { label: 'Book Call Views', value: s.book_call_views  ?? 0, color: '#f59e0b' },
    { label: 'Calls Booked',   value: (s.calls_booked_paid ?? 0) + (s.calls_booked_crm ?? 0), color: '#10b981' },
  ] : []

  return (
    <div className="min-h-screen pb-16 p-8" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/revenue" className="text-[#4b5563] hover:text-[#9ca3af] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-[20px] font-bold text-[#f9fafb]">VSL Funnel</h1>
            <p className="text-[13px] text-[#6b7280]">Funnel performance snapshots with auto-calculated rates</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(null) }}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: '#2563eb' }}
        >
          <Plus className="h-4 w-4" />
          New Snapshot
        </button>
      </div>

      {/* New snapshot form */}
      {showForm && (
        <div className="mb-6 rounded-2xl p-6"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#f9fafb]">New Funnel Snapshot</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-[#6b7280]" /></button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Meta row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 rounded-xl p-4 space-y-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Campaign Info</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Funnel Name</label>
                    <input type="text" value={form.funnel_name} onChange={e => setField('funnel_name', e.target.value)}
                      placeholder="e.g. VSL v3" className={INPUT} style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className={LABEL}>Date From</label>
                    <input type="date" value={form.date_from} onChange={e => setField('date_from', e.target.value)}
                      className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label className={LABEL}>Date To</label>
                    <input type="date" value={form.date_to} onChange={e => setField('date_to', e.target.value)}
                      className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Meta stats */}
            <div className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Meta / Ads</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Ad Spend ($)',  key: 'meta_spend'       },
                  { label: 'Impressions',   key: 'meta_impressions' },
                  { label: 'Clicks',        key: 'meta_clicks'      },
                  { label: 'Total Revenue ($)', key: 'total_revenue' },
                ].map(f => (
                  <div key={f.key}>
                    <label className={LABEL}>{f.label}</label>
                    <input type="number" min="0" step="0.01"
                      value={(form as unknown as Record<string, string>)[f.key]}
                      onChange={e => setField(f.key as keyof SnapshotForm, e.target.value)}
                      placeholder="0" className={INPUT} style={INPUT_STYLE} />
                  </div>
                ))}
              </div>
              {liveCtr && <p className="text-[11px] text-[#6b7280]">CTR: <span className="font-semibold text-[#d1d5db]">{liveCtr}</span></p>}
            </div>

            {/* Funnel steps */}
            <div className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Funnel Steps</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'LP Views',           key: 'lp_views'          },
                  { label: 'Opt-Ins',            key: 'opt_ins'           },
                  { label: 'Application Views',  key: 'application_views' },
                  { label: 'Applications',       key: 'applications'      },
                  { label: 'Book Call Views',    key: 'book_call_views'   },
                  { label: 'Calls Booked (Paid)', key: 'calls_booked_paid' },
                  { label: 'Calls Booked (CRM)', key: 'calls_booked_crm' },
                ].map(f => (
                  <div key={f.key}>
                    <label className={LABEL}>{f.label}</label>
                    <input type="number" min="0"
                      value={(form as unknown as Record<string, string>)[f.key]}
                      onChange={e => setField(f.key as keyof SnapshotForm, e.target.value)}
                      placeholder="0" className={INPUT} style={INPUT_STYLE} />
                  </div>
                ))}
              </div>
              <div className="flex gap-6 text-[11px] text-[#6b7280]">
                {liveOptIn && <span>Opt-In Rate: <strong className="text-[#d1d5db]">{liveOptIn}</strong></span>}
                {liveApply && <span>Apply Rate: <strong className="text-[#d1d5db]">{liveApply}</strong></span>}
                {liveBook  && <span>Book Rate: <strong className="text-[#d1d5db]">{liveBook}</strong></span>}
              </div>
            </div>

            {/* Downsells + notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4 space-y-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Downsell 1</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Views</label>
                    <input type="number" min="0" value={form.downsell1_views}
                      onChange={e => setField('downsell1_views', e.target.value)}
                      placeholder="0" className={INPUT} style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className={LABEL}>Clicks</label>
                    <input type="number" min="0" value={form.downsell1_clicks}
                      onChange={e => setField('downsell1_clicks', e.target.value)}
                      placeholder="0" className={INPUT} style={INPUT_STYLE} />
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-4 space-y-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Downsell 2</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Views</label>
                    <input type="number" min="0" value={form.downsell2_views}
                      onChange={e => setField('downsell2_views', e.target.value)}
                      placeholder="0" className={INPUT} style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className={LABEL}>Clicks</label>
                    <input type="number" min="0" value={form.downsell2_clicks}
                      onChange={e => setField('downsell2_clicks', e.target.value)}
                      placeholder="0" className={INPUT} style={INPUT_STYLE} />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL}>Notes</label>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
                rows={2} placeholder="Any additional context for this snapshot…"
                className={`${INPUT} resize-none`} style={INPUT_STYLE} />
            </div>

            {formError && (
              <p className="rounded-lg px-3 py-2.5 text-[12px] text-[#f87171]"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
                {formError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-medium text-[#9ca3af]"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#2563eb' }}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Snapshot'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[#4b5563]" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-xl py-16 text-center" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[14px] font-medium text-[#9ca3af]">No snapshots yet</p>
          <p className="mt-1 text-[12px] text-[#4b5563]">Create your first funnel snapshot above</p>
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* Snapshot selector */}
          <div className="w-56 shrink-0 space-y-2">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Snapshots</p>
            {snapshots.map(snap => (
              <div
                key={snap.id}
                onClick={() => setSelected(snap)}
                className="group relative cursor-pointer rounded-xl px-4 py-3 transition-all"
                style={{
                  backgroundColor: selected?.id === snap.id ? 'rgba(37,99,235,0.12)' : '#111827',
                  border: `1px solid ${selected?.id === snap.id ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <p className="text-[13px] font-semibold text-[#f9fafb]">{snap.funnel_name || 'Unnamed'}</p>
                {snap.date_from && (
                  <p className="text-[11px] text-[#6b7280]">
                    {fmtDate(snap.date_from)}{snap.date_to ? ` → ${fmtDate(snap.date_to)}` : ''}
                  </p>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(snap.id) }}
                  disabled={deleting === snap.id}
                  className="absolute right-2 top-2 hidden rounded p-1 text-[#4b5563] hover:text-[#f87171] group-hover:block"
                >
                  {deleting === snap.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>

          {/* Detail view */}
          {s && (
            <div className="flex-1 min-w-0 space-y-4">
              {/* Header */}
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-[18px] font-bold text-[#f9fafb]">{s.funnel_name || 'Unnamed'}</h2>
                    {s.date_from && (
                      <p className="text-[13px] text-[#6b7280]">
                        {fmtDate(s.date_from)}{s.date_to ? ` — ${fmtDate(s.date_to)}` : ''}
                      </p>
                    )}
                  </div>
                  {s.total_revenue != null && (
                    <div className="text-right">
                      <p className="text-[10px] text-[#4b5563]">Revenue</p>
                      <p className="font-mono text-[22px] font-bold text-[#34d399]">{fmtUSD(s.total_revenue)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta KPIs */}
              {(s.meta_spend != null || s.meta_impressions != null) && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Ad Spend',     value: s.meta_spend != null ? fmtUSD(s.meta_spend) : '—', color: '#f87171' },
                    { label: 'Impressions',  value: s.meta_impressions?.toLocaleString() ?? '—', color: '#9ca3af' },
                    { label: 'Clicks',       value: s.meta_clicks?.toLocaleString() ?? '—', color: '#9ca3af' },
                    { label: 'CTR',          value: fmtPct(s.meta_clicks ?? 0, s.meta_impressions ?? 0), color: '#60a5fa' },
                  ].map(card => (
                    <div key={card.label} className="rounded-xl p-4"
                      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">{card.label}</p>
                      <p className="font-mono text-[18px] font-bold" style={{ color: card.color }}>{card.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Visual funnel */}
              <div className="rounded-xl p-5 space-y-3"
                style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">Funnel</p>
                {FUNNEL_STEPS.filter(f => f.value > 0).map((step, i, arr) => (
                  <div key={step.label}>
                    <FunnelBar label={step.label} value={step.value} max={topValue} color={step.color} />
                    {i < arr.length - 1 && arr[i + 1].value > 0 && (
                      <div className="ml-36 pl-3 py-0.5 text-[10px] text-[#4b5563]">
                        {fmtPct(arr[i + 1].value, step.value)} →
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Call booking */}
              {(s.calls_booked_paid != null || s.calls_booked_crm != null) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-4"
                    style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Calls (Paid)</p>
                    <p className="font-mono text-[20px] font-bold text-[#10b981]">{s.calls_booked_paid ?? 0}</p>
                  </div>
                  <div className="rounded-xl p-4"
                    style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Calls (CRM)</p>
                    <p className="font-mono text-[20px] font-bold text-[#10b981]">{s.calls_booked_crm ?? 0}</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {s.notes && (
                <div className="rounded-xl p-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">Notes</p>
                  <p className="text-[13px] text-[#9ca3af] whitespace-pre-wrap">{s.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
