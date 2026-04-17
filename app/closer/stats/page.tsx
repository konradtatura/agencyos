'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/page-header'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  for_date: string
  submitted_by: string
  calls_booked: number | null
  showed: number | null
  canceled: number | null
  disqualified: number | null
  rescheduled: number | null
  followup_shown: number | null
  followup_closed: number | null
  closes: number | null
  cash_collected: number | null
  revenue: number | null
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

function aov(cash: number, closes: number): string {
  if (closes === 0) return '—'
  return '$' + Math.round(cash / closes).toLocaleString('en-US')
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

export default function CloserStatsPage() {
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
        .select('for_date, submitted_by, calls_booked, showed, canceled, disqualified, rescheduled, followup_shown, followup_closed, closes, cash_collected, revenue')
        .eq('role', 'closer')
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

  const totalBooked       = sum(rows, 'calls_booked')
  const totalShowed       = sum(rows, 'showed')
  const totalFollowupShow = sum(rows, 'followup_shown')
  const totalCallsTaken   = totalShowed + totalFollowupShow
  const totalDQ           = sum(rows, 'disqualified')
  const totalCloses       = sum(rows, 'closes')
  const totalCash         = sum(rows, 'cash_collected')
  const totalRevenue      = sum(rows, 'revenue')

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'This week' },
    { id: 'month', label: 'This month' },
    { id: 'all',   label: 'All time' },
  ]

  const kpis = [
    { label: 'Calls Booked',      value: String(totalBooked) },
    { label: 'Calls Taken',       value: String(totalCallsTaken) },
    { label: 'DQ Rate',           value: pct(totalDQ, totalBooked) },
    { label: 'Show Rate',         value: pct(totalShowed, totalBooked) },
    { label: 'Close Rate',        value: pct(totalCloses, totalShowed) },
    { label: 'AOV',               value: aov(totalCash, totalCloses) },
    { label: 'Cash Collected',    value: fmtDollars(totalCash) },
    { label: 'Revenue',           value: fmtDollars(totalRevenue) },
    { label: 'Closes / Booked',   value: pct(totalCloses, totalBooked) },
  ]

  const tableHeaders = [
    'Date',
    ...(isAdmin ? ['Name'] : []),
    'Booked', 'Showed', 'Canceled', 'DQ', 'Rescheduled',
    'FU Shown', 'FU Closed', 'Closes', 'Cash', 'Revenue',
  ]

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Closer Dashboard' : 'My Stats'}
        subtitle="End-of-day closer performance"
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
            style={filter === f.id ? { backgroundColor: '#BA7517', color: '#fff' } : { color: '#9ca3af' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#BA7517] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-9">
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
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.showed)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.canceled)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.disqualified)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.rescheduled)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.followup_shown)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.followup_closed)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{dash(row.closes)}</td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>
                          {row.cash_collected != null ? fmtDollars(row.cash_collected) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#9ca3af' }}>
                          {row.revenue != null ? fmtDollars(row.revenue) : '—'}
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
