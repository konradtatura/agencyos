/**
 * GET /api/metrics/crm
 *
 * CRM conversion metrics — funnel rates, setter/closer performance.
 *
 * Query params:
 *   range:      today | 7d | 30d | month | all | custom (default: 30d)
 *   from:       ISO string (custom range only)
 *   to:         ISO string (custom range only)
 *   creator_id: optional super_admin override
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CloserRow {
  user_id: string
  name: string
  calls_booked: number
  showed: number
  no_showed: number
  cancelled: number
  rescheduled: number
  calls_taken: number
  offers_made: number
  closes: number
  deposits: number
  disqualified_count: number
  close_rate: number
  offer_rate: number
  show_rate: number
  no_show_rate: number
  cancel_rate: number
  dq_rate: number
  cash_collected: number
  revenue_generated: number
  aov: number
  followup_payments: number
}

export interface SetterRow {
  user_id: string
  name: string
  outbound_sent: number
  inbound_received: number
  booking_links_sent: number
  calls_booked_inbound: number
  calls_booked_outbound: number
  total_booked: number
  book_rate: number
  hours_worked: number
  streak: number
}

export interface CrmMetricsResponse {
  period: {
    from: string
    to: string
    prev_from: string
    prev_to: string
    label: string
  }
  funnel: {
    total_leads_entered: number
    qualified: number
    call_booked: number
    showed: number
    closed_won: number
    disqualified: number
    downgrade_closed: number
  }
  rates: {
    dm_to_qualified: number
    book_rate: number
    show_rate: number
    close_rate: number
    offer_rate: number
    end_to_end: number
    no_show_rate: number
    cancel_rate: number
    dq_rate: number
    downgrade_conversion: number
  }
  prev_rates: {
    dm_to_qualified: number
    book_rate: number
    show_rate: number
    close_rate: number
    offer_rate: number
    end_to_end: number
    no_show_rate: number
    cancel_rate: number
    dq_rate: number
    downgrade_conversion: number
  }
  sparklines: { date: string; show_rate: number; close_rate: number; book_rate: number; offer_rate: number }[]
  setters: SetterRow[]
  closers_all_time: CloserRow[]
  closers_current_month: CloserRow[]
  weekly_trend: {
    week_label: string
    week_start: string
    show_rate: number
    close_rate: number
    book_rate: number
    offer_rate: number
    end_to_end: number
  }[]
  benchmarks: {
    book_rate: number
    show_rate: number
    close_rate: number
    offer_rate: number
  }
  alerts: {
    metric: string
    current_value: number
    average_30d: number
    delta_points: number
    supporting_fact: string
  }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): number {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10 // one decimal
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface Period {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
  label: string
}

function resolvePeriod(range: string, fromParam?: string, toParam?: string): Period {
  const now = new Date()
  let from: Date
  let to: Date = now

  switch (range) {
    case 'today':
      from = startOfDay(now)
      break
    case '7d':
      from = addDays(startOfDay(now), -7)
      break
    case 'month': {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      break
    }
    case 'all':
      from = new Date('2020-01-01T00:00:00Z')
      break
    case 'custom':
      from = fromParam ? new Date(fromParam) : addDays(startOfDay(now), -30)
      to   = toParam   ? new Date(toParam)   : now
      break
    case '30d':
    default:
      from = addDays(startOfDay(now), -30)
      break
  }

  const durationMs = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - durationMs)
  const prevTo   = new Date(from.getTime())

  const labels: Record<string, string> = {
    today: 'Today',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
    month: 'This Month',
    all: 'All Time',
    custom: 'Custom Range',
  }

  return { from, to, prevFrom, prevTo, label: labels[range] ?? 'Last 30 Days' }
}

// ── Stage count helpers ────────────────────────────────────────────────────────

function buildFunnelFromHistory(
  historyRows: { to_stage: string; changed_at: string; lead_id: string }[],
  leadsInPeriod: { id: string }[],
  allLeads: { id: string; pipeline_type: string; downgrade_stage: string | null; created_at: string; stage?: string }[],
  from: Date,
  to: Date
) {
  // Deduplicate: a lead "reached" a stage = first time it entered that stage in the period
  const reached: Record<string, Set<string>> = {}
  for (const row of historyRows) {
    const at = new Date(row.changed_at)
    if (at >= from && at <= to) {
      if (!reached[row.to_stage]) reached[row.to_stage] = new Set()
      reached[row.to_stage].add(row.lead_id)
    }
  }

  const countFromHistory = (stage: string) => reached[stage]?.size ?? 0

  // Build a map of current stage for leads in period (for per-stage fallback)
  const periodLeadIds = new Set(leadsInPeriod.map(l => l.id))
  const stageCount = (stage: string) => {
    // Primary: use history counts
    const fromHistory = countFromHistory(stage)
    if (fromHistory > 0) return fromHistory
    // Fallback: count leads in period whose current stage matches or has passed this stage
    // Only kick in when history returned nothing for this specific stage
    const stageOrder = ['new', 'qualified', 'call_booked', 'showed', 'closed_won', 'disqualified']
    const stageIdx = stageOrder.indexOf(stage)
    return allLeads.filter(l => {
      if (!periodLeadIds.has(l.id)) return false
      const currentIdx = stageOrder.indexOf(l.stage ?? '')
      // Lead's current stage is at or past the target stage (it did pass through it)
      return stageIdx >= 0 && currentIdx >= stageIdx
    }).length
  }

  const total_leads_entered = leadsInPeriod.length

  // qualified = leads that reached qualified or further
  const qualified    = stageCount('qualified')
  const call_booked  = stageCount('call_booked')
  const showed       = stageCount('showed')
  const closed_won   = stageCount('closed_won')
  // disqualified is a terminal branch, not part of the linear order — count directly
  const disqualified = countFromHistory('disqualified') > 0
    ? countFromHistory('disqualified')
    : allLeads.filter(l => periodLeadIds.has(l.id) && l.stage === 'disqualified').length

  // Downgrade closed: pipeline_type='downgrade' AND downgrade_stage='closed' updated in period
  const downgrade_closed = allLeads.filter(l =>
    l.pipeline_type === 'downgrade' && l.downgrade_stage === 'closed'
  ).length

  return { total_leads_entered, qualified, call_booked, showed, closed_won, disqualified, downgrade_closed }
}

function buildRates(
  funnel: ReturnType<typeof buildFunnelFromHistory>,
  eodTotals: { calls_completed: number; scheduled_calls: number; disqualified: number }
) {
  const { total_leads_entered, qualified, call_booked, showed, closed_won, disqualified, downgrade_closed } = funnel

  return {
    dm_to_qualified:     pct(qualified, total_leads_entered),
    book_rate:           pct(call_booked, total_leads_entered),
    show_rate:           pct(showed, call_booked),
    close_rate:          pct(closed_won, showed),
    offer_rate:          pct(eodTotals.calls_completed, eodTotals.scheduled_calls), // proxy: taken/scheduled
    end_to_end:          pct(closed_won, total_leads_entered),
    no_show_rate:        pct(call_booked - showed, call_booked),
    cancel_rate:         0, // no cancelled column yet
    dq_rate:             pct(disqualified, total_leads_entered),
    downgrade_conversion: pct(downgrade_closed, disqualified),
  }
}

// ── Streak calculation ─────────────────────────────────────────────────────────

function calcStreak(submittedDates: string[]): number {
  if (!submittedDates.length) return 0
  const unique = Array.from(new Set(submittedDates)).sort().reverse()
  let streak = 0
  let cursor = isoDate(new Date())
  for (const d of unique) {
    if (d === cursor) {
      streak++
      cursor = isoDate(addDays(new Date(cursor + 'T00:00:00Z'), -1))
    } else {
      break
    }
  }
  return streak
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId: authCreatorId, role } = auth
  const params = req.nextUrl.searchParams
  const range     = params.get('range') ?? '30d'
  const fromParam = params.get('from')  ?? undefined
  const toParam   = params.get('to')    ?? undefined

  // Super admin can pass creator_id directly if not impersonating
  const creatorId = (role === 'super_admin' ? params.get('creator_id') : null) ?? authCreatorId

  if (!creatorId) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 })
  }

  const period = resolvePeriod(range, fromParam, toParam)

  // ── 1. Get team member user IDs for this creator ───────────────────────────
  const { data: teamRows } = await admin
    .from('team_members')
    .select('user_id, role')
    .eq('creator_id', creatorId)
    .eq('active', true)

  const teamUserIds: string[] = (teamRows ?? []).map(r => r.user_id)
  const setterIds  = (teamRows ?? []).filter(r => r.role === 'setter').map(r => r.user_id)
  const closerIds  = (teamRows ?? []).filter(r => r.role === 'closer').map(r => r.user_id)

  // ── 2. Get user names ──────────────────────────────────────────────────────
  const { data: userRows } = teamUserIds.length
    ? await admin.from('users').select('id, full_name, email').in('id', teamUserIds)
    : { data: [] }

  const nameMap: Record<string, string> = {}
  for (const u of (userRows ?? [])) {
    nameMap[u.id] = u.full_name ?? u.email ?? u.id
  }

  // ── 3. Leads created in current period ────────────────────────────────────
  const { data: leadsInPeriod } = await admin
    .from('leads')
    .select('id, stage, pipeline_type, downgrade_stage, created_at')
    .eq('creator_id', creatorId)
    .gte('created_at', period.from.toISOString())
    .lte('created_at', period.to.toISOString())

  // All leads for downgrade calc (no date filter)
  const { data: allLeadsRaw } = await admin
    .from('leads')
    .select('id, pipeline_type, downgrade_stage, stage, created_at')
    .eq('creator_id', creatorId)

  const allLeads = allLeadsRaw ?? []

  // ── 4. Lead stage history for current period ───────────────────────────────
  const { data: historyInPeriod } = await admin
    .from('lead_stage_history')
    .select('lead_id, to_stage, changed_at')
    .gte('changed_at', period.from.toISOString())
    .lte('changed_at', period.to.toISOString())
    .in('lead_id',
      allLeads.map(l => l.id).length > 0 ? allLeads.map(l => l.id) : ['00000000-0000-0000-0000-000000000000']
    )

  // ── 5. EOD submissions for current period (closer) ────────────────────────
  const closerEodQuery = closerIds.length
    ? await admin
        .from('eod_submissions')
        .select('submitted_by, for_date, scheduled_calls, calls_completed, no_shows, calls_closed, no_close_calls, rebooked_no_closes, disqualified, cash_collected, revenue_closed, payment_plans, deposits_collected')
        .eq('role', 'closer')
        .gte('for_date', isoDate(period.from))
        .lte('for_date', isoDate(period.to))
        .in('submitted_by', closerIds)
    : { data: [] }

  const closerEodCurrent = closerEodQuery.data ?? []

  // ── 6. Lead stage history for previous period ──────────────────────────────
  const { data: historyPrev } = await admin
    .from('lead_stage_history')
    .select('lead_id, to_stage, changed_at')
    .gte('changed_at', period.prevFrom.toISOString())
    .lte('changed_at', period.prevTo.toISOString())
    .in('lead_id',
      allLeads.map(l => l.id).length > 0 ? allLeads.map(l => l.id) : ['00000000-0000-0000-0000-000000000000']
    )

  const { data: leadsPrevPeriod } = await admin
    .from('leads')
    .select('id, stage, pipeline_type, downgrade_stage, created_at')
    .eq('creator_id', creatorId)
    .gte('created_at', period.prevFrom.toISOString())
    .lte('created_at', period.prevTo.toISOString())

  const prevCloserEodQuery = closerIds.length
    ? await admin
        .from('eod_submissions')
        .select('submitted_by, for_date, scheduled_calls, calls_completed, no_shows, calls_closed')
        .eq('role', 'closer')
        .gte('for_date', isoDate(period.prevFrom))
        .lte('for_date', isoDate(period.prevTo))
        .in('submitted_by', closerIds)
    : { data: [] }

  const closerEodPrev = prevCloserEodQuery.data ?? []

  // ── 7. Last 30 days for sparklines ─────────────────────────────────────────
  const thirtyDaysAgo = addDays(startOfDay(new Date()), -30)

  const { data: history30d } = await admin
    .from('lead_stage_history')
    .select('lead_id, to_stage, changed_at')
    .gte('changed_at', thirtyDaysAgo.toISOString())
    .in('lead_id',
      allLeads.map(l => l.id).length > 0 ? allLeads.map(l => l.id) : ['00000000-0000-0000-0000-000000000000']
    )

  const leads30d = allLeads.filter(l => new Date(l.created_at) >= thirtyDaysAgo)

  const closerEod30dQuery = closerIds.length
    ? await admin
        .from('eod_submissions')
        .select('submitted_by, for_date, scheduled_calls, calls_completed, calls_closed')
        .eq('role', 'closer')
        .gte('for_date', isoDate(thirtyDaysAgo))
        .in('submitted_by', closerIds)
    : { data: [] }

  const closerEod30d = closerEod30dQuery.data ?? []

  // ── 8. All-time closer EOD ─────────────────────────────────────────────────
  const closerEodAllQuery = closerIds.length
    ? await admin
        .from('eod_submissions')
        .select('submitted_by, for_date, scheduled_calls, calls_completed, no_shows, calls_closed, no_close_calls, rebooked_no_closes, disqualified, cash_collected, revenue_closed, payment_plans, deposits_collected')
        .eq('role', 'closer')
        .in('submitted_by', closerIds)
    : { data: [] }

  const closerEodAll = closerEodAllQuery.data ?? []

  // Current month closer EOD
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const closerEodMonthQuery = closerIds.length
    ? await admin
        .from('eod_submissions')
        .select('submitted_by, for_date, scheduled_calls, calls_completed, no_shows, calls_closed, no_close_calls, rebooked_no_closes, disqualified, cash_collected, revenue_closed, payment_plans, deposits_collected')
        .eq('role', 'closer')
        .gte('for_date', isoDate(monthStart))
        .in('submitted_by', closerIds)
    : { data: [] }

  const closerEodMonth = closerEodMonthQuery.data ?? []

  // ── 9. Setter EOD (all, for streak and performance) ───────────────────────
  const setterEodQuery = setterIds.length
    ? await admin
        .from('eod_submissions')
        .select('submitted_by, for_date, outbound_attempts, inbound_responses, booking_links_sent, calls_booked')
        .eq('role', 'setter')
        .in('submitted_by', setterIds)
    : { data: [] }

  const setterEodAll = setterEodQuery.data ?? []

  // Setter EOD for current period
  const setterEodPeriod = setterEodAll.filter(r => {
    const d = new Date(r.for_date + 'T00:00:00Z')
    return d >= period.from && d <= period.to
  })

  // ── 10. Compute funnel + rates ─────────────────────────────────────────────
  const eodTotalsCurrent = {
    calls_completed: closerEodCurrent.reduce((s, r) => s + (r.calls_completed ?? 0), 0),
    scheduled_calls: closerEodCurrent.reduce((s, r) => s + (r.scheduled_calls ?? 0), 0),
    disqualified:    closerEodCurrent.reduce((s, r) => s + (r.disqualified ?? 0), 0),
  }

  const funnelCurrent = buildFunnelFromHistory(
    historyInPeriod ?? [],
    leadsInPeriod ?? [],
    allLeads,
    period.from,
    period.to,
  )
  const ratesCurrent = buildRates(funnelCurrent, eodTotalsCurrent)

  const eodTotalsPrev = {
    calls_completed: closerEodPrev.reduce((s, r) => s + ((r as any).calls_completed ?? 0), 0),
    scheduled_calls: closerEodPrev.reduce((s, r) => s + ((r as any).scheduled_calls ?? 0), 0),
    disqualified: 0,
  }
  const funnelPrev = buildFunnelFromHistory(
    historyPrev ?? [],
    leadsPrevPeriod ?? [],
    allLeads,
    period.prevFrom,
    period.prevTo,
  )
  const ratesPrev = buildRates(funnelPrev, eodTotalsPrev)

  // ── 11. Sparklines (30-day daily) ─────────────────────────────────────────
  const sparklines: CrmMetricsResponse['sparklines'] = []
  for (let i = 29; i >= 0; i--) {
    const day     = addDays(startOfDay(new Date()), -i)
    const dayNext = addDays(day, 1)
    const dateStr = isoDate(day)

    const dayLeads = leads30d.filter(l => {
      const d = new Date(l.created_at)
      return d >= day && d < dayNext
    })

    const dayHistory = (history30d ?? []).filter(r => {
      const d = new Date(r.changed_at)
      return d >= day && d < dayNext
    })

    const dayEod = closerEod30d.filter(r => r.for_date === dateStr)

    const df = buildFunnelFromHistory(dayHistory, dayLeads, allLeads, day, dayNext)
    const eodDay = {
      calls_completed: dayEod.reduce((s, r) => s + (r.calls_completed ?? 0), 0),
      scheduled_calls: dayEod.reduce((s, r) => s + (r.scheduled_calls ?? 0), 0),
      disqualified: 0,
    }
    const dr = buildRates(df, eodDay)
    sparklines.push({ date: dateStr, show_rate: dr.show_rate, close_rate: dr.close_rate, book_rate: dr.book_rate, offer_rate: dr.offer_rate })
  }

  // ── 12. Weekly trend (last 12 weeks) ──────────────────────────────────────
  const weekly_trend: CrmMetricsResponse['weekly_trend'] = []
  for (let w = 11; w >= 0; w--) {
    const weekEnd   = addDays(startOfDay(new Date()), -w * 7)
    const weekStart = addDays(weekEnd, -7)
    const wh = (history30d ?? []).filter(r => {
      const d = new Date(r.changed_at)
      return d >= weekStart && d < weekEnd
    })
    // For 12-week data we need history beyond 30d, but we only fetched 30d
    // Use allLeads for broader context, fetch fresh if needed
    const wLeads = allLeads.filter(l => {
      const d = new Date(l.created_at)
      return d >= weekStart && d < weekEnd
    })
    const wEod = closerEodAll.filter(r => {
      const d = new Date(r.for_date + 'T00:00:00Z')
      return d >= weekStart && d < weekEnd
    })
    const wf = buildFunnelFromHistory(wh, wLeads, allLeads, weekStart, weekEnd)
    const we = {
      calls_completed: wEod.reduce((s, r) => s + (r.calls_completed ?? 0), 0),
      scheduled_calls: wEod.reduce((s, r) => s + (r.scheduled_calls ?? 0), 0),
      disqualified: 0,
    }
    const wr = buildRates(wf, we)

    const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const endLabel   = addDays(weekEnd, -1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

    weekly_trend.push({
      week_label:  `${startLabel} – ${endLabel}`,
      week_start:  isoDate(weekStart),
      show_rate:   wr.show_rate,
      close_rate:  wr.close_rate,
      book_rate:   wr.book_rate,
      offer_rate:  wr.offer_rate,
      end_to_end:  wr.end_to_end,
    })
  }

  // ── 13. Per-setter aggregation ────────────────────────────────────────────
  const setters: SetterRow[] = setterIds.map(uid => {
    const rows = setterEodPeriod.filter(r => r.submitted_by === uid)
    const allRows = setterEodAll.filter(r => r.submitted_by === uid)
    const outbound_sent    = rows.reduce((s, r) => s + (r.outbound_attempts ?? 0), 0)
    const inbound_received = rows.reduce((s, r) => s + (r.inbound_responses ?? 0), 0)
    const booking_links    = rows.reduce((s, r) => s + (r.booking_links_sent ?? 0), 0)
    const total_booked     = rows.reduce((s, r) => s + (r.calls_booked ?? 0), 0)
    const denom = outbound_sent + inbound_received
    const streak = calcStreak(allRows.map(r => r.for_date))
    return {
      user_id: uid,
      name: nameMap[uid] ?? uid,
      outbound_sent,
      inbound_received,
      booking_links_sent: booking_links,
      calls_booked_inbound: 0,   // Sprint 10 column, not yet migrated
      calls_booked_outbound: 0,  // Sprint 10 column, not yet migrated
      total_booked,
      book_rate: pct(total_booked, denom),
      hours_worked: 0,           // not tracked
      streak,
    }
  })

  // ── 14. Per-closer aggregation ────────────────────────────────────────────
  function buildCloserRows(eodRows: typeof closerEodAll): CloserRow[] {
    return closerIds.map(uid => {
      const rows = eodRows.filter(r => r.submitted_by === uid)
      const calls_booked     = rows.reduce((s, r) => s + (r.scheduled_calls ?? 0), 0)
      const showed           = rows.reduce((s, r) => s + (r.calls_completed ?? 0), 0)
      const no_showed        = rows.reduce((s, r) => s + (r.no_shows ?? 0), 0)
      const rescheduled      = rows.reduce((s, r) => s + (r.rebooked_no_closes ?? 0), 0)
      const calls_taken      = rows.reduce((s, r) => s + (r.calls_completed ?? 0), 0)
      // offers_made = calls_taken proxy (every taken call is assumed to have an offer)
      const offers_made      = calls_taken
      const closes           = rows.reduce((s, r) => s + (r.calls_closed ?? 0), 0)
      const disqualified_cnt = rows.reduce((s, r) => s + (r.disqualified ?? 0), 0)
      const cash_collected   = rows.reduce((s, r) => s + Number(r.cash_collected ?? 0), 0)
      const revenue_generated= rows.reduce((s, r) => s + Number(r.revenue_closed ?? 0), 0)
      const followup_payments= rows.reduce((s, r) => s + (r.payment_plans ?? 0), 0)
      // deposits: sum of deposits_collected amounts
      const deposits         = rows.reduce((s, r) => s + Number(r.deposits_collected ?? 0), 0)

      return {
        user_id:           uid,
        name:              nameMap[uid] ?? uid,
        calls_booked,
        showed,
        no_showed,
        cancelled:         0, // no column yet
        rescheduled,
        calls_taken,
        offers_made,
        closes,
        deposits,
        disqualified_count: disqualified_cnt,
        close_rate:        pct(closes, showed),
        offer_rate:        pct(offers_made, calls_taken),
        show_rate:         pct(showed, calls_booked),
        no_show_rate:      pct(no_showed, calls_booked),
        cancel_rate:       0,
        dq_rate:           pct(disqualified_cnt, calls_taken),
        cash_collected,
        revenue_generated,
        aov:               closes > 0 ? Math.round(cash_collected / closes) : 0,
        followup_payments,
      }
    })
  }

  const closers_all_time      = buildCloserRows(closerEodAll)
  const closers_current_month = buildCloserRows(closerEodMonth)

  // ── 15. Benchmarks (hardcoded) ─────────────────────────────────────────────
  const benchmarks = { book_rate: 15, show_rate: 60, close_rate: 20, offer_rate: 80 }

  // ── 16. Alerts (10%+ below benchmark using 30-day avg) ────────────────────
  const avg30 = {
    show_rate:  sparklines.reduce((s, d) => s + d.show_rate, 0) / sparklines.length || 0,
    close_rate: sparklines.reduce((s, d) => s + d.close_rate, 0) / sparklines.length || 0,
    book_rate:  sparklines.reduce((s, d) => s + d.book_rate, 0) / sparklines.length || 0,
    offer_rate: sparklines.reduce((s, d) => s + d.offer_rate, 0) / sparklines.length || 0,
  }

  const alerts: CrmMetricsResponse['alerts'] = []

  // Only alert on rates that have benchmark data
  const rateAlertConfig = [
    { key: 'show_rate'  as const, label: 'Show rate',   current: ratesCurrent.show_rate,   avg: avg30.show_rate },
    { key: 'close_rate' as const, label: 'Close rate',  current: ratesCurrent.close_rate,  avg: avg30.close_rate },
    { key: 'book_rate'  as const, label: 'Book rate',   current: ratesCurrent.book_rate,   avg: avg30.book_rate },
    { key: 'offer_rate' as const, label: 'Offer rate',  current: ratesCurrent.offer_rate,  avg: avg30.offer_rate },
  ]

  for (const { label, current, avg } of rateAlertConfig) {
    if (avg > 0 && (avg - current) >= 10) {
      const delta_points = Math.round((avg - current) * 10) / 10
      let supporting_fact = ''
      if (label === 'Show rate') {
        const noShows = funnelCurrent.call_booked - funnelCurrent.showed
        if (noShows > 0) supporting_fact = `${noShows} no-show${noShows !== 1 ? 's' : ''} this period`
      } else if (label === 'Close rate') {
        const missed = funnelCurrent.showed - funnelCurrent.closed_won
        if (missed > 0) supporting_fact = `${missed} showed but did not close`
      } else if (label === 'Book rate') {
        supporting_fact = `${funnelCurrent.total_leads_entered} leads entered, only ${funnelCurrent.call_booked} booked`
      }
      alerts.push({ metric: label, current_value: current, average_30d: Math.round(avg * 10) / 10, delta_points, supporting_fact })
    }
  }

  // ── 17. Assemble response ─────────────────────────────────────────────────
  const response: CrmMetricsResponse = {
    period: {
      from:      period.from.toISOString(),
      to:        period.to.toISOString(),
      prev_from: period.prevFrom.toISOString(),
      prev_to:   period.prevTo.toISOString(),
      label:     period.label,
    },
    funnel:              funnelCurrent,
    rates:               ratesCurrent,
    prev_rates:          ratesPrev,
    sparklines,
    setters,
    closers_all_time,
    closers_current_month,
    weekly_trend,
    benchmarks,
    alerts,
  }

  return NextResponse.json(response)
}
