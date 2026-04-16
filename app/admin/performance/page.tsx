import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMonthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getThisSunday(): string {
  const now = new Date()
  const dow = now.getUTCDay() // 0 = Sunday
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow
  const sunday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilSunday,
  ))
  return sunday.toISOString().slice(0, 10)
}

function getMonthLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    year:  'numeric',
    timeZone: 'UTC',
  })
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtRate(n: number): string {
  return `${n.toFixed(1)}%`
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function showRateColor(rate: number | null): string {
  if (rate === null) return '#4b5563'
  if (rate >= 60) return '#34d399'
  if (rate >= 40) return '#f59e0b'
  return '#ef4444'
}

function closeRateColor(rate: number | null): string {
  if (rate === null) return '#4b5563'
  if (rate >= 20) return '#34d399'
  if (rate >= 10) return '#f59e0b'
  return '#ef4444'
}

function callsColor(n: number): string {
  return n > 0 ? '#60a5fa' : '#4b5563'
}

function revenueColor(n: number): string {
  return n > 0 ? '#34d399' : '#4b5563'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PerformancePage() {
  const admin = createAdminClient()

  const today      = getToday()
  const monthStart = getMonthStart()
  const thisSunday = getThisSunday()

  // ── Parallel queries ──────────────────────────────────────────────────────
  const [creatorsRes, revenueRes, bookedRes, stageRes] = await Promise.all([
    // 1. All creators
    admin
      .from('creator_profiles')
      .select('id, name, niche')
      .order('name', { ascending: true }),

    // 2. Revenue MTD grouped by creator
    admin
      .from('sales')
      .select('creator_id, amount')
      .gte('sale_date', monthStart)
      .lte('sale_date', today),

    // 3. Booked calls: today through this Sunday, stage = call_booked
    admin
      .from('leads')
      .select('creator_id, booked_at')
      .not('booked_at', 'is', null)
      .gte('booked_at', `${today}T00:00:00Z`)
      .lte('booked_at', `${thisSunday}T23:59:59Z`)
      .eq('stage', 'call_booked'),

    // 4. Stage counts for show/close rates (all time)
    admin
      .from('leads')
      .select('creator_id, stage'),
  ])

  const creators = creatorsRes.data ?? []
  const sales    = revenueRes.data  ?? []
  const booked   = bookedRes.data   ?? []
  const allLeads = stageRes.data    ?? []

  // ── Build revenue map ─────────────────────────────────────────────────────
  const revenueMap: Record<string, number> = {}
  for (const row of sales) {
    const cid = row.creator_id as string
    revenueMap[cid] = (revenueMap[cid] ?? 0) + Number(row.amount)
  }

  // ── Build calls maps ──────────────────────────────────────────────────────
  const callsTodayMap: Record<string, number>    = {}
  const callsThisWeekMap: Record<string, number> = {}

  for (const row of booked) {
    const cid = row.creator_id as string
    callsThisWeekMap[cid] = (callsThisWeekMap[cid] ?? 0) + 1
    // booked_at is today if the ISO date matches
    const bookedDate = (row.booked_at as string).slice(0, 10)
    if (bookedDate === today) {
      callsTodayMap[cid] = (callsTodayMap[cid] ?? 0) + 1
    }
  }

  // ── Build stage count maps ────────────────────────────────────────────────
  const showedMap:     Record<string, number> = {}
  const callBookedMap: Record<string, number> = {}
  const closedWonMap:  Record<string, number> = {}

  for (const row of allLeads) {
    const cid = row.creator_id as string
    if (row.stage === 'showed')     showedMap[cid]     = (showedMap[cid]     ?? 0) + 1
    if (row.stage === 'call_booked') callBookedMap[cid] = (callBookedMap[cid] ?? 0) + 1
    if (row.stage === 'closed_won') closedWonMap[cid]  = (closedWonMap[cid]  ?? 0) + 1
  }

  // ── Compute per-creator rates ─────────────────────────────────────────────
  function getShowRate(creatorId: string): number | null {
    const showed     = showedMap[creatorId]     ?? 0
    const callBooked = callBookedMap[creatorId] ?? 0
    const denom = showed + callBooked
    if (denom === 0) return null
    return (showed / denom) * 100
  }

  function getCloseRate(creatorId: string): number | null {
    const showed    = showedMap[creatorId]    ?? 0
    const closedWon = closedWonMap[creatorId] ?? 0
    if (showed === 0) return null
    return (closedWon / showed) * 100
  }

  const monthLabel = getMonthLabel()

  const thStyle: React.CSSProperties = {
    padding:       '12px 20px',
    fontSize:      '10px',
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#6b7280',
    textAlign:     'left',
    whiteSpace:    'nowrap',
  }

  return (
    <div>
      <PageHeader title="Performance" subtitle="Live metrics across all creators" />

      {/* ── Period pill ───────────────────────────────────────────────────── */}
      <div className="mb-6">
        <span
          style={{
            display:         'inline-block',
            backgroundColor: '#1f2937',
            color:           '#9ca3af',
            fontSize:        '12px',
            padding:         '4px 12px',
            borderRadius:    '9999px',
          }}
        >
          {monthLabel} · Revenue
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          backgroundColor: '#111827',
          border:          '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th style={thStyle}>Creator</th>
              <th style={thStyle}>Revenue (MTD)</th>
              <th style={thStyle}>Today</th>
              <th style={thStyle}>This Week</th>
              <th style={thStyle}>Show Rate</th>
              <th style={thStyle}>Close Rate</th>
            </tr>
          </thead>
          <tbody>
            {creators.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-center"
                  style={{ padding: '48px 20px', color: '#6b7280', fontSize: '14px' }}
                >
                  No creators found.
                </td>
              </tr>
            ) : (
              creators.map((creator, i) => {
                const revenue      = revenueMap[creator.id] ?? 0
                const callsToday   = callsTodayMap[creator.id]    ?? 0
                const callsWeek    = callsThisWeekMap[creator.id] ?? 0
                const showRate     = getShowRate(creator.id)
                const closeRate    = getCloseRate(creator.id)
                const isLast       = i === creators.length - 1

                return (
                  <tr
                    key={creator.id}
                    style={{
                      borderBottom: isLast
                        ? 'none'
                        : '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    {/* Creator */}
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#f9fafb' }}>
                        {creator.name}
                      </p>
                      {creator.niche && (
                        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          {creator.niche}
                        </p>
                      )}
                    </td>

                    {/* Revenue MTD */}
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{
                        fontSize:   '14px',
                        fontWeight: 600,
                        color:      revenue > 0 ? revenueColor(revenue) : '#4b5563',
                      }}>
                        {revenue > 0 ? fmtUSD(revenue) : '—'}
                      </p>
                    </td>

                    {/* Today */}
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{
                        fontSize:   '14px',
                        fontWeight: 600,
                        color:      callsColor(callsToday),
                      }}>
                        {callsToday}
                      </p>
                    </td>

                    {/* This week */}
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{
                        fontSize:   '14px',
                        fontWeight: 600,
                        color:      callsColor(callsWeek),
                      }}>
                        {callsWeek}
                      </p>
                    </td>

                    {/* Show rate */}
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{
                        fontSize:   '14px',
                        fontWeight: 600,
                        color:      showRateColor(showRate),
                      }}>
                        {showRate !== null ? fmtRate(showRate) : '—'}
                      </p>
                    </td>

                    {/* Close rate */}
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{
                        fontSize:   '14px',
                        fontWeight: 600,
                        color:      closeRateColor(closeRate),
                      }}>
                        {closeRate !== null ? fmtRate(closeRate) : '—'}
                      </p>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
