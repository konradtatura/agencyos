import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import PrintButton from './PrintButton'

// ── Types ─────────────────────────────────────────────────────────────────────

type Range = 'this_month' | 'last_month' | '30d' | '7d'

interface Period {
  from:     string
  to:       string
  prevFrom: string
  prevTo:   string
  label:    string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function resolvePeriod(range: Range): Period {
  const now   = new Date()
  const today = isoDate(now)

  switch (range) {
    case 'last_month': {
      const from     = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
      const to       = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)))
      const prevFrom = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)))
      const prevTo   = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 0)))
      return { from, to, prevFrom, prevTo, label: 'Last Month' }
    }
    case '30d': {
      const from     = isoDate(new Date(Date.now() - 30 * 86_400_000))
      const prevFrom = isoDate(new Date(Date.now() - 60 * 86_400_000))
      return { from, to: today, prevFrom, prevTo: from, label: 'Last 30 Days' }
    }
    case '7d': {
      const from     = isoDate(new Date(Date.now() - 7  * 86_400_000))
      const prevFrom = isoDate(new Date(Date.now() - 14 * 86_400_000))
      return { from, to: today, prevFrom, prevTo: from, label: 'Last 7 Days' }
    }
    case 'this_month':
    default: {
      const from     = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
      const prevFrom = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
      const prevTo   = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate())))
      return { from, to: today, prevFrom, prevTo, label: 'This Month' }
    }
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ── Stage helpers ─────────────────────────────────────────────────────────────

const CLOSED_WON_STAGES = new Set([
  'closed_won', 'High Ticket PiF', 'High Ticket Split',
  'Mid Ticket PiF', 'Mid Ticket Split', 'Low Ticket',
])

const CALL_BOOKED_STAGES = new Set(['call_booked', 'Booked', 'Booked MT Call'])

function stageDisplayName(stage: string): string {
  const map: Record<string, string> = {
    new: 'DMd', New: 'DMd',
    qualifying: 'Qualifying', Qualifying: 'Qualifying',
    qualified: 'Qualified', Qualified: 'Qualified',
    call_booked: 'Call Booked', Booked: 'Call Booked', 'Booked MT Call': 'Call Booked',
    showed: 'Showed',
    closed_won: 'Closed Won',
    'High Ticket PiF': 'Closed Won', 'High Ticket Split': 'Closed Won',
    'Mid Ticket PiF': 'Closed Won', 'Mid Ticket Split': 'Closed Won',
    'Low Ticket': 'Closed Won',
  }
  return map[stage] ?? stage
}

function stageColor(stage: string): string {
  if (CLOSED_WON_STAGES.has(stage)) return '#34d399'
  if (stage === 'showed')           return '#60a5fa'
  if (CALL_BOOKED_STAGES.has(stage)) return '#f59e0b'
  return '#9ca3af'
}

function offerTierStyle(tier: string | null): React.CSSProperties {
  if (!tier) return {}
  const t = tier.toLowerCase()
  if (t === 'ht') return { backgroundColor: 'rgba(37,99,235,0.15)',   color: '#60a5fa' }
  if (t === 'mt') return { backgroundColor: 'rgba(139,92,246,0.15)',  color: '#a78bfa' }
  return             { backgroundColor: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
}

// ── Shared style constants ────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  backgroundColor: '#111827',
  border:          '1px solid rgba(255,255,255,0.06)',
  borderRadius:    12,
  padding:         '20px',
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize:      '11px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color:         '#6b7280',
  marginBottom:  '12px',
}

const TH: React.CSSProperties = {
  padding:       '10px 16px',
  fontSize:      '10px',
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color:         '#6b7280',
  textAlign:     'left',
  whiteSpace:    'nowrap',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { creator_id?: string; range?: string }
}) {
  const admin = createAdminClient()

  // ── State 1: Creator picker ───────────────────────────────────────────────
  if (!searchParams.creator_id) {
    const { data: creators } = await admin
      .from('creator_profiles')
      .select('id, name, niche')
      .order('name', { ascending: true })

    return (
      <div>
        <PageHeader title="Reports" subtitle="Select a creator to generate their report" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {(creators ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/admin/reports?creator_id=${c.id}&range=this_month`}
              className="block rounded-xl"
              style={{
                backgroundColor: '#111827',
                border:          '1px solid rgba(255,255,255,0.06)',
                padding:         '20px',
                textDecoration:  'none',
              }}
            >
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#f9fafb' }}>{c.name}</p>
              {c.niche && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{c.niche}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  // ── State 2: Full report ──────────────────────────────────────────────────

  const creatorId = searchParams.creator_id
  const range     = (searchParams.range ?? 'this_month') as Range
  const period    = resolvePeriod(range)

  const RANGES: { value: Range; label: string }[] = [
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: '30d',        label: '30d'        },
    { value: '7d',         label: '7d'         },
  ]

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    creatorRes,
    revenueRes,
    revenuePrevRes,
    leadsInPeriodRes,
    allLeadsRes,
    bookedCallsRes,
    igSnapshotsRes,
    igPostsRes,
    funnelSnapshotsRes,
  ] = await Promise.all([
    admin.from('creator_profiles').select('id, name, niche').eq('id', creatorId).single(),

    admin.from('sales').select('amount').eq('creator_id', creatorId)
      .gte('sale_date', period.from).lte('sale_date', period.to),

    admin.from('sales').select('amount').eq('creator_id', creatorId)
      .gte('sale_date', period.prevFrom).lte('sale_date', period.prevTo),

    admin.from('leads').select('stage').eq('creator_id', creatorId)
      .gte('created_at', `${period.from}T00:00:00Z`)
      .lte('created_at', `${period.to}T23:59:59Z`),

    admin.from('leads').select('stage').eq('creator_id', creatorId),

    admin.from('leads')
      .select('id, name, ig_handle, booked_at, offer_tier, stage')
      .eq('creator_id', creatorId)
      .not('booked_at', 'is', null)
      .gte('booked_at', `${period.from}T00:00:00Z`)
      .lte('booked_at', `${period.to}T23:59:59Z`)
      .order('booked_at', { ascending: true }),

    admin.from('instagram_account_snapshots')
      .select('date, followers_count')
      .eq('creator_id', creatorId)
      .gte('date', period.from).lte('date', period.to)
      .order('date', { ascending: true }),

    admin.from('instagram_posts')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId)
      .gte('posted_at', `${period.from}T00:00:00Z`)
      .lte('posted_at', `${period.to}T23:59:59Z`),

    admin.from('funnel_snapshots')
      .select('funnel_name, date_from, date_to, meta_spend, lp_views, opt_ins, applications, calls_booked_paid, calls_booked_crm, total_revenue')
      .eq('creator_id', creatorId)
      .gte('date_from', period.from).lte('date_to', period.to)
      .order('date_from', { ascending: false }),
  ])

  const creator       = creatorRes.data
  const revenue       = revenueRes.data    ?? []
  const revenuePrev   = revenuePrevRes.data ?? []
  const leadsInPeriod = leadsInPeriodRes.data ?? []
  const allLeads      = allLeadsRes.data      ?? []
  const bookedCalls   = bookedCallsRes.data   ?? []
  const igSnapshots   = igSnapshotsRes.data   ?? []
  const igPostCount   = igPostsRes.count      ?? 0
  const funnelSnaps   = funnelSnapshotsRes.data ?? []

  // ── Revenue ───────────────────────────────────────────────────────────────
  const totalRevenue     = revenue.reduce((s, r) => s + Number(r.amount), 0)
  const totalRevenuePrev = revenuePrev.reduce((s, r) => s + Number(r.amount), 0)
  const dealCount        = revenue.length

  // ── Stage counts (all-time for rate calcs) ────────────────────────────────
  let totalShowed = 0, totalBooked = 0, totalClosedWon = 0
  for (const l of allLeads) {
    if (l.stage === 'showed')              totalShowed++
    if (CALL_BOOKED_STAGES.has(l.stage))  totalBooked++
    if (CLOSED_WON_STAGES.has(l.stage))   totalClosedWon++
  }
  const showRate  = (totalShowed + totalBooked) > 0
    ? (totalShowed / (totalShowed + totalBooked)) * 100 : null
  const closeRate = totalShowed > 0
    ? (totalClosedWon / totalShowed) * 100 : null

  // ── Pipeline buckets ──────────────────────────────────────────────────────
  const pipelineBuckets: Record<string, number> = {}
  for (const l of leadsInPeriod) {
    const display = stageDisplayName(l.stage)
    pipelineBuckets[display] = (pipelineBuckets[display] ?? 0) + 1
  }
  const PIPELINE_ORDER = ['DMd', 'Qualifying', 'Qualified', 'Call Booked', 'Showed', 'Closed Won']

  // ── Instagram ─────────────────────────────────────────────────────────────
  const netFollowers = igSnapshots.reduce((s, r) => s + (r.followers_count ?? 0), 0)
  const hasIgData    = igSnapshots.length > 0 || igPostCount > 0

  // ── Calls table ───────────────────────────────────────────────────────────
  const callsToShow   = bookedCalls.slice(0, 20)
  const callsOverflow = bookedCalls.length - callsToShow.length

  return (
    <>
      <style>{`
        @media print {
          nav, aside, [data-sidebar], .no-print { display: none !important; }
          body, main { background: white !important; color: black !important; }
          .page-break-avoid { page-break-inside: avoid; }
        }
      `}</style>

      <div>
        {/* ── Back + print ────────────────────────────────────────────── */}
        <div className="no-print mb-5 flex items-center justify-between">
          <Link href="/admin/reports" style={{ fontSize: '13px', color: '#9ca3af', textDecoration: 'none' }}>
            ← Reports
          </Link>
          <PrintButton />
        </div>

        {/* ── Report header ────────────────────────────────────────────── */}
        <div className="no-print mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f9fafb' }}>
              {creator?.name ?? '—'}
            </h1>
            {creator?.niche && (
              <span style={{
                backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa',
                fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '9999px',
              }}>
                {creator.niche}
              </span>
            )}
          </div>
          <div
            className="flex gap-1 rounded-lg p-1"
            style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {RANGES.map(({ value, label }) => (
              <Link
                key={value}
                href={`/admin/reports?creator_id=${creatorId}&range=${value}`}
                style={{
                  backgroundColor: range === value ? '#2563eb' : 'transparent',
                  color:           range === value ? '#ffffff' : '#9ca3af',
                  borderRadius: '6px', padding: '4px 12px', fontSize: '13px',
                  fontWeight: 500, textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="page-break-avoid mb-6 flex flex-wrap gap-4">
          <div className="flex-1 rounded-xl" style={{ ...CARD, minWidth: '150px' }}>
            <p style={SECTION_LABEL}>Revenue</p>
            <p style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1, color: totalRevenue > totalRevenuePrev ? '#34d399' : totalRevenue > 0 ? '#f9fafb' : '#4b5563' }}>
              {totalRevenue > 0 ? fmtUSD(totalRevenue) : '—'}
            </p>
            <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>
              vs {totalRevenuePrev > 0 ? fmtUSD(totalRevenuePrev) : '$0'} prev
            </p>
          </div>

          <div className="flex-1 rounded-xl" style={{ ...CARD, minWidth: '130px' }}>
            <p style={SECTION_LABEL}>Calls Booked</p>
            <p style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1, color: '#f9fafb' }}>
              {bookedCalls.length}
            </p>
            <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>in selected period</p>
          </div>

          <div className="flex-1 rounded-xl" style={{ ...CARD, minWidth: '120px' }}>
            <p style={SECTION_LABEL}>Show Rate</p>
            <p style={{
              fontSize: '26px', fontWeight: 700, lineHeight: 1,
              color: showRate === null ? '#4b5563' : showRate >= 60 ? '#34d399' : showRate >= 40 ? '#f59e0b' : '#ef4444',
            }}>
              {showRate !== null ? fmtPct(showRate) : '—'}
            </p>
            <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>all-time</p>
          </div>

          <div className="flex-1 rounded-xl" style={{ ...CARD, minWidth: '120px' }}>
            <p style={SECTION_LABEL}>Close Rate</p>
            <p style={{
              fontSize: '26px', fontWeight: 700, lineHeight: 1,
              color: closeRate === null ? '#4b5563' : closeRate >= 20 ? '#34d399' : closeRate >= 10 ? '#f59e0b' : '#ef4444',
            }}>
              {closeRate !== null ? fmtPct(closeRate) : '—'}
            </p>
            <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>all-time</p>
          </div>

          <div className="flex-1 rounded-xl" style={{ ...CARD, minWidth: '130px' }}>
            <p style={SECTION_LABEL}>New Followers</p>
            <p style={{
              fontSize: '26px', fontWeight: 700, lineHeight: 1,
              color: !hasIgData ? '#4b5563' : netFollowers > 0 ? '#34d399' : netFollowers < 0 ? '#f87171' : '#9ca3af',
            }}>
              {!hasIgData ? '—' : netFollowers >= 0 ? `+${netFollowers.toLocaleString()}` : netFollowers.toLocaleString()}
            </p>
            <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>net delta</p>
          </div>
        </div>

        {/* ── Section: Sales & Pipeline ─────────────────────────────────── */}
        <div className="page-break-avoid mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl" style={CARD}>
            <p style={SECTION_LABEL}>Revenue Breakdown</p>
            {totalRevenue === 0 ? (
              <p style={{ fontSize: '13px', color: '#4b5563' }}>No sales recorded for this period.</p>
            ) : (
              <>
                <p style={{ fontSize: '32px', fontWeight: 700, color: '#34d399', lineHeight: 1 }}>
                  {fmtUSD(totalRevenue)}
                </p>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
                  {dealCount} deal{dealCount !== 1 ? 's' : ''} · {period.label}
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl" style={CARD}>
            <p style={SECTION_LABEL}>New Leads This Period</p>
            {leadsInPeriod.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#4b5563' }}>No new leads in this period.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {PIPELINE_ORDER.map((display) => {
                  const cnt = pipelineBuckets[display]
                  if (!cnt) return null
                  const isClosedWon = display === 'Closed Won'
                  return (
                    <div key={display} className="flex items-center justify-between">
                      <p style={{ fontSize: '13px', color: isClosedWon ? '#34d399' : '#9ca3af' }}>{display}</p>
                      <span style={{
                        backgroundColor: isClosedWon ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
                        color: isClosedWon ? '#34d399' : '#f9fafb',
                        fontSize: '12px', fontWeight: 600, padding: '1px 8px', borderRadius: '9999px',
                      }}>
                        {cnt}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Section: Calls ───────────────────────────────────────────── */}
        <div className="page-break-avoid mb-6">
          <p style={SECTION_LABEL}>Calls</p>
          <div className="overflow-hidden rounded-xl" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
            {bookedCalls.length === 0 ? (
              <div className="flex items-center justify-center" style={{ padding: '32px 20px' }}>
                <p style={{ fontSize: '13px', color: '#4b5563' }}>No calls booked in this period.</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <th style={TH}>Name</th>
                      <th style={TH}>@Handle</th>
                      <th style={TH}>Offer</th>
                      <th style={TH}>Booked At</th>
                      <th style={TH}>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callsToShow.map((call, i) => (
                      <tr
                        key={call.id}
                        style={{
                          borderBottom:    i < callsToShow.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          backgroundColor: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '11px 16px', fontSize: '13px', color: '#f9fafb', fontWeight: 500 }}>
                          {call.name ?? '—'}
                        </td>
                        <td style={{ padding: '11px 16px', fontSize: '13px', color: '#9ca3af' }}>
                          {call.ig_handle ? `@${call.ig_handle}` : '—'}
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          {call.offer_tier ? (
                            <span style={{ ...offerTierStyle(call.offer_tier), fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px' }}>
                              {call.offer_tier.toUpperCase()}
                            </span>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#4b5563' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '11px 16px', fontSize: '13px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                          {call.booked_at ? fmtDateTime(call.booked_at) : '—'}
                        </td>
                        <td style={{ padding: '11px 16px', fontSize: '12px', color: stageColor(call.stage), fontWeight: 500 }}>
                          {call.stage ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {callsOverflow > 0 && (
                  <p style={{ padding: '10px 16px', fontSize: '12px', color: '#6b7280', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {callsOverflow} more call{callsOverflow !== 1 ? 's' : ''} not shown
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Section: Instagram ───────────────────────────────────────── */}
        <div className="page-break-avoid mb-6">
          <p style={SECTION_LABEL}>Instagram</p>
          {!hasIgData ? (
            <div className="rounded-xl" style={CARD}>
              <p style={{ fontSize: '13px', color: '#4b5563' }}>
                Instagram not connected or no data for this period.
              </p>
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1 rounded-xl" style={CARD}>
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: '8px' }}>
                  Posts Published
                </p>
                <p style={{ fontSize: '26px', fontWeight: 700, color: '#f9fafb', lineHeight: 1 }}>
                  {igPostCount > 0 ? igPostCount : '—'}
                </p>
              </div>
              <div className="flex-1 rounded-xl" style={CARD}>
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: '8px' }}>
                  Net Followers
                </p>
                <p style={{
                  fontSize: '26px', fontWeight: 700, lineHeight: 1,
                  color: netFollowers > 0 ? '#34d399' : netFollowers < 0 ? '#f87171' : '#9ca3af',
                }}>
                  {igSnapshots.length === 0 ? '—' : netFollowers >= 0 ? `+${netFollowers.toLocaleString()}` : netFollowers.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Section: Funnel Performance ──────────────────────────────── */}
        <div className="page-break-avoid mb-6">
          <p style={SECTION_LABEL}>Funnel Performance</p>
          {funnelSnaps.length === 0 ? (
            <div className="rounded-xl" style={CARD}>
              <p style={{ fontSize: '13px', color: '#4b5563' }}>
                No funnel snapshots for this period.{' '}
                <Link href="/dashboard/revenue/funnel" style={{ color: '#60a5fa' }}>
                  Add them in Revenue → VSL Funnel.
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {funnelSnaps.map((snap, i) => {
                const optInRate   = (snap.lp_views    ?? 0) > 0 ? ((snap.opt_ins      ?? 0) / (snap.lp_views!))    * 100 : null
                const appRate     = (snap.opt_ins     ?? 0) > 0 ? ((snap.applications ?? 0) / (snap.opt_ins!))     * 100 : null
                const callsBooked = (snap.calls_booked_paid ?? 0) + (snap.calls_booked_crm ?? 0)

                return (
                  <div key={i} className="page-break-avoid rounded-xl" style={CARD}>
                    <div className="mb-4">
                      <p style={{ fontSize: '15px', fontWeight: 600, color: '#f9fafb' }}>
                        {snap.funnel_name ?? 'Unnamed Funnel'}
                      </p>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {fmtDate(snap.date_from)} – {fmtDate(snap.date_to)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                      {([
                        { label: 'LP Views',     value: (snap.lp_views ?? 0).toLocaleString() },
                        { label: 'Opt-ins',      value: snap.opt_ins != null ? `${snap.opt_ins.toLocaleString()}${optInRate !== null ? ` (${fmtPct(optInRate)})` : ''}` : '—' },
                        { label: 'Applications', value: snap.applications != null ? `${snap.applications.toLocaleString()}${appRate !== null ? ` (${fmtPct(appRate)})` : ''}` : '—' },
                        { label: 'Calls Booked', value: callsBooked.toLocaleString() },
                        { label: 'Revenue',      value: snap.total_revenue != null ? fmtUSD(Number(snap.total_revenue)) : '—' },
                        { label: 'Ad Spend',     value: snap.meta_spend    != null ? fmtUSD(Number(snap.meta_spend))    : '—' },
                      ] as { label: string; value: string }[]).map(({ label, value }) => (
                        <div key={label}>
                          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: '4px' }}>
                            {label}
                          </p>
                          <p style={{ fontSize: '16px', fontWeight: 700, color: '#f9fafb' }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
