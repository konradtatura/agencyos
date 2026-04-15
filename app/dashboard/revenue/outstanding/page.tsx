'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import type { PaymentInstalmentWithRelations } from '@/types/revenue'

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const CARD = { backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 } as const

function StatusBadge({ status, daysOverdue }: { status: string; daysOverdue: number }) {
  if (status === 'paid') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
      <CheckCircle className="h-3 w-3" /> Paid
    </span>
  )
  if (status === 'overdue') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
      <AlertCircle className="h-3 w-3" /> Overdue {daysOverdue > 0 ? `(${daysOverdue}d)` : ''}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: '#9ca3af' }}>
      <Clock className="h-3 w-3" /> Pending
    </span>
  )
}

export default function OutstandingPage() {
  const [instalments, setInstalments] = useState<PaymentInstalmentWithRelations[]>([])
  const [loading,     setLoading]     = useState(true)
  const [marking,     setMarking]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/revenue/instalments')
    const data = await res.json()
    setInstalments(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markPaid(id: string) {
    setMarking(id)
    await fetch(`/api/revenue/instalments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    setMarking(null)
    load()
  }

  const today = new Date()
  function daysOverdue(dueDate: string): number {
    const due = new Date(dueDate + 'T00:00:00')
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000))
  }

  // Sort: overdue first, then by due_date
  const sorted = [...instalments].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return a.due_date.localeCompare(b.due_date)
  })

  const totalOwed = instalments
    .filter(i => i.status !== 'paid')
    .reduce((s, i) => s + Number(i.amount), 0)

  const overdueAmt = instalments
    .filter(i => i.status === 'overdue')
    .reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div className="min-h-screen pb-16 p-8" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/revenue" className="text-[#4b5563] hover:text-[#9ca3af] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-[20px] font-bold text-[#f9fafb]">Outstanding Payments</h1>
          <p className="text-[13px] text-[#6b7280]">Active instalment schedules and overdue amounts</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="mb-6 flex gap-3 flex-wrap">
        {[
          { label: 'Total Owed',  value: fmtUSD(totalOwed),   color: '#fbbf24' },
          { label: 'Overdue',     value: fmtUSD(overdueAmt),  color: '#f87171' },
          { label: 'Instalments', value: String(instalments.filter(i => i.status !== 'paid').length), color: '#9ca3af' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-mono text-[18px] font-bold" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[12px] text-[#6b7280]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl" style={CARD}>
        {loading ? (
          <div className="py-16 text-center text-[13px] text-[#4b5563]">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle className="mx-auto mb-3 h-8 w-8 text-[#10b981]" />
            <p className="text-[14px] font-medium text-[#9ca3af]">No outstanding payments</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Customer', 'Product', 'Instalment', 'Due Date', 'Amount', 'Status', 'Days Overdue', 'Closer', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(inst => {
                  const overdueDays = daysOverdue(inst.due_date)
                  const customerName = (inst.sale as any)?.lead?.name ?? '—'
                  const productName  = (inst.sale as any)?.product_name ?? '—'
                  const closerName   = (inst.sale as any)?.closer?.full_name ?? '—'
                  return (
                    <tr key={inst.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-[13px] font-medium text-[#f9fafb]">{customerName}</td>
                      <td className="px-4 py-3 text-[13px] text-[#9ca3af]">{productName}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-[#d1d5db]">#{inst.instalment_number}</td>
                      <td className="px-4 py-3 text-[13px] text-[#9ca3af]">{fmtDate(inst.due_date)}</td>
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[#f9fafb]">{fmtUSD(Number(inst.amount))}</td>
                      <td className="px-4 py-3"><StatusBadge status={inst.status} daysOverdue={overdueDays} /></td>
                      <td className="px-4 py-3 font-mono text-[13px] text-[#9ca3af]">
                        {inst.status === 'overdue' ? <span className="text-[#f87171]">{overdueDays}d</span> : '—'}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#9ca3af]">{closerName}</td>
                      <td className="px-4 py-3">
                        {inst.status !== 'paid' && (
                          <button
                            onClick={() => markPaid(inst.id)}
                            disabled={marking === inst.id}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                            style={{ backgroundColor: '#10b981' }}
                          >
                            {marking === inst.id ? 'Saving…' : 'Mark Paid'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
