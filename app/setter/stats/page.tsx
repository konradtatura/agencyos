import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/get-session-user'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'

export default async function SetterStatsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data: rows } = await admin
    .from('eod_submissions')
    .select(
      'for_date, outbound_attempts, inbound_responses, booking_links_sent, good_convos, calls_booked, no_response_follows, energy_level, top_3_wins'
    )
    .eq('submitted_by', user.id)
    .eq('role', 'setter')
    .gte('for_date', since)
    .order('for_date', { ascending: false })

  const submissions = rows ?? []

  // ── Aggregations ─────────────────────────────────────────────────────────
  const totalOutbound   = submissions.reduce((s, r) => s + (r.outbound_attempts ?? 0), 0)
  const totalGoodConvos = submissions.reduce((s, r) => s + (r.good_convos ?? 0), 0)
  const totalBooked     = submissions.reduce((s, r) => s + (r.calls_booked ?? 0), 0)
  const totalLinks      = submissions.reduce((s, r) => s + (r.booking_links_sent ?? 0), 0)
  const bookRate        = totalOutbound > 0 ? (totalBooked / totalOutbound) * 100 : null
  const daysSubmitted   = submissions.length

  // Streak: consecutive days ending today with a submission
  const submittedDates = new Set(submissions.map((r) => r.for_date))
  let streak = 0
  const cursor = new Date()
  cursor.setUTCHours(0, 0, 0, 0)
  while (true) {
    const key = cursor.toISOString().split('T')[0]
    if (!submittedDates.has(key)) break
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday: 'short',
      month:   'short',
      day:     'numeric',
      timeZone: 'UTC',
    })
  }

  function dash(v: number | null | undefined) {
    return v != null ? String(v) : '—'
  }

  const recent14 = submissions.slice(0, 14)

  // ── KPI card helper ───────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Outbound DMs',   value: String(totalOutbound) },
    { label: 'Good Convos',    value: String(totalGoodConvos) },
    { label: 'Calls Booked',   value: String(totalBooked) },
    { label: 'Book Rate',      value: bookRate != null ? `${bookRate.toFixed(1)}%` : '—' },
    { label: 'Days Submitted', value: `${daysSubmitted} / 30 days` },
  ]

  return (
    <div>
      <PageHeader title="My Stats" subtitle="Your performance over the last 30 days" />

      {/* ── KPI Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl"
            style={{
              backgroundColor: '#111827',
              border:          '1px solid rgba(255,255,255,0.06)',
              padding:         '20px',
            }}
          >
            <p
              style={{
                fontSize:       '10px',
                fontWeight:     600,
                textTransform:  'uppercase',
                letterSpacing:  '0.1em',
                color:          '#6b7280',
                marginBottom:   '10px',
              }}
            >
              {card.label}
            </p>
            <p
              style={{
                fontSize:   '26px',
                fontWeight: 700,
                color:      '#f9fafb',
                lineHeight: 1,
              }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Streak callout ───────────────────────────────────────────────── */}
      <div
        className="mt-4 flex items-center justify-center rounded-xl"
        style={{
          backgroundColor: '#1f2937',
          border:          '1px solid rgba(255,255,255,0.06)',
          padding:         '12px 20px',
        }}
      >
        <p style={{ color: '#f9fafb', fontSize: '14px', fontWeight: 600 }}>
          {streak >= 3 ? `🔥 ${streak} day streak` : `${streak} day streak`}
        </p>
      </div>

      {/* ── Recent submissions table ─────────────────────────────────────── */}
      <div
        className="mt-6 rounded-xl overflow-hidden"
        style={{
          backgroundColor: '#111827',
          border:          '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Date', 'Outbound', 'Good Convos', 'Booked', 'Links Sent', 'Energy'].map((col) => (
                <th
                  key={col}
                  className="text-left"
                  style={{
                    padding:        '12px 16px',
                    fontSize:       '10px',
                    fontWeight:     600,
                    textTransform:  'uppercase',
                    letterSpacing:  '0.08em',
                    color:          '#6b7280',
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
                    {dash(row.outbound_attempts)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dash(row.good_convos)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dash(row.calls_booked)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {dash(row.booking_links_sent)}
                  </td>
                  <td style={{ padding: '11px 16px', color: '#9ca3af' }}>
                    {row.energy_level != null ? `${row.energy_level}/10` : '—'}
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
