'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/page-header'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  for_date: string
  submitted_by: string
  calls_booked: number | null
  outbound_sent: number | null
  inbound_received: number | null
  outbound_booked_q: number | null
  inbound_booked_q: number | null
  dq_forms: number | null
  booking_links_sent: number | null
  downsell_cash: number | null
}

type Filter = 'today' | 'week' | 'month' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function startOf(filter: Filter): string | null {
  const now = new Date()
  if (filter === 'today') return todayStr()
  if (filter === 'week') {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d.toISOString().slice(0, 10)
  }
  if (filter === 'month') {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  }
  return null
}

function sum(rows: Row[], key: keyof Row): number {
  return rows.reduce((s, r) => s + ((r[key] as number | null) ?? 0), 0)
}

function pct(num: number, den: number): string {
  if (den === 0) return '—'
  return `${((num / den) * 100).toFixed(1)}%`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function fmtDollars(v: number) {
  return '$' + Math.round(v).toLocaleString('en-US')
}

function dash(v: number | null | undefined) {
  return v != null ? String(v) : '—'
}

// ── UI Primitives ─────────────────────────────────────────────────────────────

const CARD = {
  backgroundColor: '#111827',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '20px',
  borderRadius: '12px',
}

const LABEL: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: '#6b7280', marginBottom: '10px',
}

const VALUE: React.CSSProperties = {
  fontSize: '26px', fontWeight: 700, color: '#f9fafb', lineHeight: 1,
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={CARD}>
      <p style={LABEL}>{label}</p>
      <p style={VALUE}>{value}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SetterStatsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<Filter>('month')
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single()

      const admin = profile?.role === 'creator' || profile?.role === 'super_admin'
      setIsAdmin(admin)

      const from = startOf(filter)
      let query = supabase
        .from('eod_submissions')
        .select('for_date, submitted_by, calls_booked, outbound_sent, inbound_received, outbound_booked_q, inbound_booked_q, dq_forms, booking_links_sent, downsell_cash')
        .eq('role', 'setter')
        .order('for_date', { ascending: false })

      if (!admin) query = query.eq('submitted_by', authUser.id)
      if (from) query = query.gte('for_date', from)

      const { data } = await query
      setRows((data as Row[]) ?? [])
      setLoading(false)
    }
    load()
  }, [filter])

  // ── Aggregations ─────────────────────────────────────────────────────────────

  const totalBooked = sum(rows, 'calls_booked')
  const totalOB     = sum(rows, 'outbound_sent')
  const totalIB     = sum(rows, 'inbound_received')
  const totalLeads  = totalOB + totalIB
  const totalDQ     = sum(rows, 'dq_forms')
  const totalLinks  = sum(rows, 'booking_links_sent')
  const totalCash   = sum(rows, 'downsell_cash')

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'This week' },
    { id: 'month', label: 'This month' },
    { id: 'all',   label: 'All time' },
  ]

  const kpis = [
    { label: 'Calls Booked',        value: String(totalBooked) },
    { label: 'Total Leads (OB+IB)', value: String(totalLeads) },
    { label: 'DQ Forms',            value: String(totalDQ) },
    { label: 'Booking Links Sent',  value: String(totalLinks) },
    { label: 'Lead → Booking Rate', value: pct(totalBooked, totalLeads) },
    { label: 'Qualification Rate',  value: pct(totalBooked, totalBooked + totalDQ) },
    { label: 'Downsell Cash',       value: fmtDollars(totalCash) },
  ]

  const tableHeaders = [
    'Date',
    ...(isAdmin ? ['Name'] : []),
    'Booked', 'OB Sent', 'IB Recv', 'OB Booked Q', 'IB Booked Q',
    'DQ Forms', 'Links Sent', 'Downsell $',
  ]

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Setter Dashboard' : 'My Stats'}
        subtitle="End-of-day setter performance"
      />

      {/* Filter row */}
      <div
        className="mb-6 flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="rounded-lg px-4 py-2 text-[13px] font-medium transition-all"
            style={filter === f.id ? { backgroundColor: '#1D9E75', color: '#fff' } : { color: '#9ca3af' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1D9E75] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
            {kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} />)}
          </div>

          {/* Submissions log */}
          <div
            className="mt-6 overflow-hidden rounded-xl"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ ...LABEL, marginBottom: 0 }}>All Submissions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {tableHeaders.map((col) => (
                      <th
                        key={col}
                        className="text-left"
                        style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tableHeaders.length}
                        className="text-center"
                        style={{ padding: '32px 16px', color: '#6b7280', fontSize: '13px' }}
                      >
                        No submissions for this period.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <tr
                        key={`${row.submitted_by}-${row.for_date}`}
                        style={{
                          backgroundColor: i % 2 === 1 ? '#1f2937' : 'transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <td style={{ padding: '10px 14px', color: '#f9fafb', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {fmtDate(row.for_date)}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: '10px 14px', color: '#9ca3af' }}>—</td>
                        )}
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.calls_booked)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.outbound_sent)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.inbound_received)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.outbound_booked_q)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.inbound_booked_q)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.dq_forms)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.booking_links_sent)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>
                          {row.downsell_cash != null ? fmtDollars(row.downsell_cash) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
