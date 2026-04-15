import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/get-session-user'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'

export default async function CloserStatsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data: rows } = await admin
    .from('eod_submissions')
    .select(
      'for_date, scheduled_calls, calls_completed, no_shows, calls_closed, no_close_calls, rebooked_no_closes, disqualified, cash_collected, revenue_closed, payment_plans, full_pay, deposits_collected, confidence_level, no_close_reasons, coaching_needed_on'
    )
    .eq('submitted_by', user.id)
    .eq('role', 'closer')
    .gte('for_date', since)
    .order('for_date', { ascending: false })

  const submissions = rows ?? []

  // ── Aggregations ─────────────────────────────────────────────────────────
  const totalScheduled = submissions.reduce((s, r) => s + (r.scheduled_calls ?? 0), 0)
  const totalCompleted = submissions.reduce((s, r) => s + (r.calls_completed ?? 0), 0)
  const totalClosed    = submissions.reduce((s, r) => s + (r.calls_closed ?? 0), 0)
  const totalCash      = submissions.reduce((s, r) => s + (r.cash_collected ?? 0), 0)
  const totalRevenue   = submissions.reduce((s, r) => s + (r.revenue_closed ?? 0), 0)
  const daysSubmitted  = submissions.length

  const showRate  = totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : null
  const closeRate = totalCompleted > 0 ? (totalClosed / totalCompleted) * 100 : null

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday:  'short',
      month:    'short',
      day:      'numeric',
      timeZone: 'UTC',
    })
  }

  function fmtDollars(v: number) {
    return '$' + Math.round(v).toLocaleString('en-US')
  }

  function dash(v: number | null | undefined) {
    return v != null ? String(v) : '—'
  }

  function dashDollars(v: number | null | undefined) {
    return v != null ? fmtDollars(v) : '—'
  }

  const recent14 = submissions.slice(0, 14)

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Calls Scheduled', value: String(totalScheduled) },
    { label: 'Calls Completed', value: String(totalCompleted) },
    { label: 'Show Rate',       value: showRate  != null ? `${showRate.toFixed(1)}%`  : '—' },
    { label: 'Closes',          value: String(totalClosed) },
    { label: 'Close Rate',      value: closeRate != null ? `${closeRate.toFixed(1)}%` : '—' },
    { label: 'Cash Collected',  value: fmtDollars(totalCash) },
  ]

  const cardStyle = {
    backgroundColor: '#111827',
    border:          '1px solid rgba(255,255,255,0.06)',
    padding:         '20px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize:      '10px',
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#6b7280',
    marginBottom:  '10px',
  }

  const valueStyle: React.CSSProperties = {
    fontSize:   '26px',
    fontWeight: 700,
    color:      '#f9fafb',
    lineHeight: 1,
  }

  return (
    <div>
      <PageHeader title="My Stats" subtitle="Your performance over the last 30 days" />

      {/* ── KPI Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <div key={card.label} className="rounded-xl" style={cardStyle}>
            <p style={labelStyle}>{card.label}</p>
            <p style={valueStyle}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Revenue row ─────────────────────────────────────────────────── */}
      <div
        className="mt-4 flex items-center justify-between rounded-xl"
        style={cardStyle}
      >
        <div>
          <p style={labelStyle}>Revenue Closed</p>
          <p style={valueStyle}>{fmtDollars(totalRevenue)}</p>
        </div>
        <div className="text-right">
          <p style={labelStyle}>Days Submitted</p>
          <p style={valueStyle}>{daysSubmitted} / 30 days</p>
        </div>
      </div>

      {/* ── Recent submissions table ─────────────────────────────────────── */}
      <div
        className="mt-6 overflow-hidden rounded-xl"
        style={{
          backgroundColor: '#111827',
          border:          '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Date', 'Scheduled', 'Completed', 'Closed', 'Cash', 'Confidence'].map((col) => (
                <th
                  key={col}
                  className="text-left"
                  style={{
                    padding:       '12px 16px',
                    fontSize:      '10px',
                    fontWeight:    600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color:         '#6b7280',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent14.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center"
                  style={{ padding: '32px 16px', color: '#6b7280', fontSize: '13px' }}
                >
                  No submissions in the last 30 days.
                </td>
              </tr>
            ) : (
              recent14.map((row, i) => (
                <tr
                  key={row.for_date}
                  style={{
                    backgroundColor: i % 2 === 1 ? '#1f2937' : 'transparent',
                    borderBottom:    '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <td style={{ padding: '11px 16px', color: '#f9fafb', fontWeight: 500 }}>
                    {fmtDate(row.for_date)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dash(row.scheduled_calls)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dash(row.calls_completed)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dash(row.calls_closed)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dashDollars(row.cash_collected)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {row.confidence_level != null ? `${row.confidence_level}/10` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
