'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import type { Expense } from '@/types/revenue'

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const CATEGORIES = [
  { value: 'vendor',     label: 'Vendor' },
  { value: 'sales_team', label: 'Sales Team' },
  { value: 'ad_spend',   label: 'Ad Spend' },
  { value: 'other',      label: 'Other' },
]

const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  vendor:     { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  sales_team: { bg: 'rgba(16,185,129,0.12)', color: '#34d399' },
  ad_spend:   { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
  other:      { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af' },
}

const INPUT = 'w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none focus:ring-1 focus:ring-[#2563eb] transition-colors placeholder:text-[#4b5563]'
const INPUT_STYLE = { backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
const LABEL = 'mb-1.5 block text-[12px] font-medium text-[#9ca3af]'
const CARD = { backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 } as const

interface ExpenseForm {
  category: string
  description: string
  amount: string
  date: string
  platform: string
  notes: string
}

const EMPTY_FORM: ExpenseForm = {
  category: 'vendor', description: '', amount: '', date: new Date().toISOString().slice(0, 10),
  platform: '', notes: '',
}

export default function ExpensesPage() {
  const [expenses,   setExpenses]   = useState<Expense[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState<ExpenseForm>(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo)   params.set('to', dateTo)
    const res  = await fetch(`/api/revenue/expenses?${params}`)
    const data = await res.json()
    setExpenses(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  function setField(k: keyof ExpenseForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.amount || Number(form.amount) <= 0) { setFormError('Amount must be greater than 0'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/revenue/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category:    form.category,
          description: form.description || null,
          amount:      Number(form.amount),
          date:        form.date,
          platform:    form.platform || null,
          notes:       form.notes    || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error ?? 'Save failed'); return }
      setForm(EMPTY_FORM)
      setShowForm(false)
      load()
    } catch {
      setFormError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/revenue/expenses/${id}`, { method: 'DELETE' })
    setDeleting(null)
    load()
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Category', 'Description', 'Platform', 'Amount', 'Notes'],
      ...expenses.map(e => [
        e.date, e.category, e.description ?? '', e.platform ?? '',
        String(e.amount), e.notes ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'expenses.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const byCategory    = CATEGORIES.map(c => ({
    ...c,
    total: expenses.filter(e => e.category === c.value).reduce((s, e) => s + Number(e.amount), 0),
  }))

  return (
    <div className="min-h-screen pb-16 p-8" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/revenue" className="text-[#4b5563] hover:text-[#9ca3af] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-[20px] font-bold text-[#f9fafb]">Expenses</h1>
            <p className="text-[13px] text-[#6b7280]">Track vendor, ad spend, and team costs</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="rounded-xl px-4 py-2 text-[12px] font-medium text-[#9ca3af] hover:text-[#f9fafb] transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            Export CSV
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(null) }}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: '#2563eb' }}
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="mb-6 flex items-center gap-3">
        <label className="text-[12px] text-[#6b7280]">From</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-[12px] text-[#d1d5db] outline-none focus:ring-1 focus:ring-[#2563eb]"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.08)', colorScheme: 'dark' }} />
        <label className="text-[12px] text-[#6b7280]">To</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-[12px] text-[#d1d5db] outline-none focus:ring-1 focus:ring-[#2563eb]"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.08)', colorScheme: 'dark' }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-[12px] text-[#6b7280] hover:text-[#9ca3af] transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Summary pills */}
      <div className="mb-6 flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="font-mono text-[18px] font-bold text-[#f87171]">{fmtUSD(totalExpenses)}</span>
          <span className="text-[12px] text-[#6b7280]">Total Expenses</span>
        </div>
        {byCategory.filter(c => c.total > 0).map(c => {
          const cc = CAT_COLORS[c.value]
          return (
            <div key={c.value} className="flex items-center gap-2 rounded-xl px-4 py-2.5"
              style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="font-mono text-[16px] font-bold" style={{ color: cc.color }}>{fmtUSD(c.total)}</span>
              <span className="text-[12px] text-[#6b7280]">{c.label}</span>
            </div>
          )
        })}
      </div>

      {/* Add expense form */}
      {showForm && (
        <div className="mb-6 rounded-2xl p-6"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="mb-4 text-[14px] font-semibold text-[#f9fafb]">New Expense</h3>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Category</label>
              <select value={form.category} onChange={e => setField('category', e.target.value)}
                className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Amount ($) <span className="text-[#ef4444]">*</span></label>
              <input type="number" step="0.01" min="0" value={form.amount}
                onChange={e => setField('amount', e.target.value)} placeholder="0.00"
                required className={INPUT} style={INPUT_STYLE} />
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <input type="text" value={form.description} onChange={e => setField('description', e.target.value)}
                placeholder="What was this for?" className={INPUT} style={INPUT_STYLE} />
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={form.date} onChange={e => setField('date', e.target.value)}
                className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
            </div>
            <div>
              <label className={LABEL}>Platform / Vendor</label>
              <input type="text" value={form.platform} onChange={e => setField('platform', e.target.value)}
                placeholder="e.g. Facebook Ads, Stripe" className={INPUT} style={INPUT_STYLE} />
            </div>
            <div>
              <label className={LABEL}>Notes</label>
              <input type="text" value={form.notes} onChange={e => setField('notes', e.target.value)}
                placeholder="Optional note" className={INPUT} style={INPUT_STYLE} />
            </div>

            {formError && (
              <div className="col-span-2">
                <p className="rounded-lg px-3 py-2.5 text-[12px] text-[#f87171]"
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  {formError}
                </p>
              </div>
            )}

            <div className="col-span-2 flex gap-3 pt-1">
              <button type="button" onClick={() => { setShowForm(false); setFormError(null) }}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-medium text-[#9ca3af] hover:text-[#f9fafb] transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#2563eb' }}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl" style={CARD}>
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#4b5563]">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px] font-medium text-[#9ca3af]">No expenses recorded</p>
            <p className="mt-1 text-[12px] text-[#4b5563]">Add your first expense above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Date', 'Category', 'Description', 'Platform', 'Amount', 'Notes', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => {
                  const cc = CAT_COLORS[exp.category] ?? CAT_COLORS.other
                  return (
                    <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-[13px] text-[#9ca3af]">{fmtDate(exp.date)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: cc.bg, color: cc.color }}>
                          {CATEGORIES.find(c => c.value === exp.category)?.label ?? exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#d1d5db]">{exp.description ?? '—'}</td>
                      <td className="px-4 py-3 text-[13px] text-[#9ca3af]">{exp.platform ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[#f9fafb]">{fmtUSD(Number(exp.amount))}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="block truncate text-[12px] text-[#6b7280]">{exp.notes ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(exp.id)}
                          disabled={deleting === exp.id}
                          className="rounded-lg p-1.5 text-[#4b5563] hover:text-[#f87171] hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {deleting === exp.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={4} className="px-4 py-3 text-[12px] font-semibold text-[#6b7280]">Total</td>
                  <td className="px-4 py-3 font-mono text-[14px] font-bold text-[#f9fafb]">{fmtUSD(totalExpenses)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
