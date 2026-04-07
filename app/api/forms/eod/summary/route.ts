/**
 * GET /api/forms/eod/summary?range=7d|30d|today
 *   Returns aggregated stats for the EOD performance dashboard.
 *   Creator/admin only.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

function startDate(range: string): string {
  const now = new Date()
  if (range === 'today') {
    return now.toISOString().slice(0, 10)
  }
  const days = range === '30d' ? 30 : 7
  now.setDate(now.getDate() - (days - 1))
  return now.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role } = authResult

  if (role === 'setter' || role === 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') ?? '7d'
  const from  = startDate(range)
  const today = new Date().toISOString().slice(0, 10)

  // Fetch all submissions in range, joined with user info
  const { data: rows, error } = await admin
    .from('eod_submissions')
    .select(`
      *,
      users!eod_submissions_submitted_by_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .gte('for_date', from)
    .lte('for_date', today)
    .order('for_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allRows = rows ?? []

  // ── Setter stats ────────────────────────────────────────────────────────────
  const setterRows = allRows.filter((r) => r.role === 'setter')

  const totalSetterSubmissions = setterRows.length
  const totalCallsBooked       = setterRows.reduce((s, r) => s + (r.calls_booked ?? 0), 0)
  const totalOutboundAttempts  = setterRows.reduce((s, r) => s + (r.outbound_attempts ?? 0), 0)
  const totalInboundResponses  = setterRows.reduce((s, r) => s + (r.inbound_responses ?? 0), 0)
  const avgBookingRate = totalOutboundAttempts > 0
    ? Math.round((totalCallsBooked / totalOutboundAttempts) * 100 * 10) / 10
    : 0
  const avgResponseRate = totalOutboundAttempts > 0
    ? Math.round((totalInboundResponses / totalOutboundAttempts) * 100 * 10) / 10
    : 0
  const energyLevels = setterRows.filter((r) => r.energy_level != null).map((r) => r.energy_level as number)
  const avgEnergyLevel = energyLevels.length > 0
    ? Math.round((energyLevels.reduce((s, v) => s + v, 0) / energyLevels.length) * 10) / 10
    : 0

  // Unique active setters
  const activeSetterIds = new Set(setterRows.map((r) => r.submitted_by))
  const totalActiveSetters = activeSetterIds.size

  // EOD completion this week (Mon–Sun)
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const thisWeekSetterRows = setterRows.filter((r) => r.for_date >= weekStartStr)
  const daysElapsed = Math.max(1, Math.floor((Date.now() - weekStart.getTime()) / 86400000) + 1)
  const eodCompletionRate = totalActiveSetters > 0
    ? Math.round((thisWeekSetterRows.length / (totalActiveSetters * daysElapsed)) * 100)
    : 0

  // Calls booked by setter
  const callsBySetterMap: Record<string, { name: string; calls_booked: number }> = {}
  for (const r of setterRows) {
    const uid = r.submitted_by as string
    const name = (r.users as { full_name?: string; email?: string } | null)?.full_name
      || (r.users as { email?: string } | null)?.email
      || uid.slice(0, 8)
    if (!callsBySetterMap[uid]) callsBySetterMap[uid] = { name, calls_booked: 0 }
    callsBySetterMap[uid].calls_booked += r.calls_booked ?? 0
  }
  const callsBySetter = Object.values(callsBySetterMap).sort((a, b) => b.calls_booked - a.calls_booked)

  // Weekly trend (group by week)
  const weeklySetterTrend: Record<string, { week: string; calls_booked: number; submissions: number }> = {}
  for (const r of setterRows) {
    const d = new Date(r.for_date as string)
    const mon = new Date(d)
    mon.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
    const wk = mon.toISOString().slice(0, 10)
    if (!weeklySetterTrend[wk]) weeklySetterTrend[wk] = { week: wk, calls_booked: 0, submissions: 0 }
    weeklySetterTrend[wk].calls_booked  += r.calls_booked ?? 0
    weeklySetterTrend[wk].submissions   += 1
  }
  const setterWeeklyTrend = Object.values(weeklySetterTrend).sort((a, b) => a.week.localeCompare(b.week))

  // WoW growth % calls booked
  let wowGrowthCallsBooked: number | null = null
  if (setterWeeklyTrend.length >= 2) {
    const last   = setterWeeklyTrend[setterWeeklyTrend.length - 1].calls_booked
    const prev   = setterWeeklyTrend[setterWeeklyTrend.length - 2].calls_booked
    wowGrowthCallsBooked = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null
  }

  // Setter leaderboard
  const setterLeaderboard = Object.entries(callsBySetterMap).map(([uid, d]) => {
    const userRows = setterRows.filter((r) => r.submitted_by === uid)
    const outbound = userRows.reduce((s, r) => s + (r.outbound_attempts ?? 0), 0)
    const booked   = d.calls_booked
    const bookRate = outbound > 0 ? Math.round((booked / outbound) * 100 * 10) / 10 : 0
    const energies = userRows.filter((r) => r.energy_level != null).map((r) => r.energy_level as number)
    const avgEnergy = energies.length > 0
      ? Math.round(energies.reduce((s, v) => s + v, 0) / energies.length * 10) / 10
      : 0
    return { uid, name: d.name, calls_booked: booked, booking_rate: bookRate, avg_energy: avgEnergy }
  }).sort((a, b) => b.calls_booked - a.calls_booked)

  // Red flags: energy < 6 OR booking rate < 20%
  const setterRedFlags = setterLeaderboard.filter((s) => s.avg_energy < 6 || s.booking_rate < 20)

  // Activity feed: last 10 setter submissions
  const setterActivity = [...setterRows]
    .sort((a, b) => (b.for_date as string).localeCompare(a.for_date as string) || (b.created_at as string).localeCompare(a.created_at as string))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      for_date: r.for_date,
      name: (r.users as { full_name?: string } | null)?.full_name ?? 'Unknown',
      top_3_wins: r.top_3_wins,
      calls_booked: r.calls_booked,
      energy_level: r.energy_level,
    }))

  // ── Closer stats ────────────────────────────────────────────────────────────
  const closerRows = allRows.filter((r) => r.role === 'closer')

  const totalCloserSubmissions  = closerRows.length
  const totalCallsCompleted     = closerRows.reduce((s, r) => s + (r.calls_completed ?? 0), 0)
  const totalRevenueClosed      = closerRows.reduce((s, r) => s + (r.revenue_closed ?? 0), 0)
  const totalCashCollected      = closerRows.reduce((s, r) => s + (r.cash_collected ?? 0), 0)
  const totalCallsClosed        = closerRows.reduce((s, r) => s + (r.calls_closed ?? 0), 0)
  const totalScheduledCalls     = closerRows.reduce((s, r) => s + (r.scheduled_calls ?? 0), 0)
  const avgCloseRate = totalCallsCompleted > 0
    ? Math.round((totalCallsClosed / totalCallsCompleted) * 100 * 10) / 10
    : 0
  const avgShowRate = totalScheduledCalls > 0
    ? Math.round(((totalScheduledCalls - closerRows.reduce((s, r) => s + (r.no_shows ?? 0), 0)) / totalScheduledCalls) * 100 * 10) / 10
    : 0

  // No-close reasons distribution
  const noCloseMap: Record<string, number> = {}
  for (const r of closerRows) {
    if (r.no_close_reasons) {
      noCloseMap[r.no_close_reasons as string] = (noCloseMap[r.no_close_reasons as string] ?? 0) + 1
    }
  }
  const noCloseDistribution = Object.entries(noCloseMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  // Daily revenue trend
  const dailyRevMap: Record<string, { date: string; revenue_closed: number; cash_collected: number; calls_closed: number }> = {}
  for (const r of closerRows) {
    const d = r.for_date as string
    if (!dailyRevMap[d]) dailyRevMap[d] = { date: d, revenue_closed: 0, cash_collected: 0, calls_closed: 0 }
    dailyRevMap[d].revenue_closed += r.revenue_closed ?? 0
    dailyRevMap[d].cash_collected += r.cash_collected ?? 0
    dailyRevMap[d].calls_closed   += r.calls_closed   ?? 0
  }
  const dailyRevenueTrend = Object.values(dailyRevMap).sort((a, b) => a.date.localeCompare(b.date))

  // Weekly calls closed trend
  const weeklyCloserTrend: Record<string, { week: string; calls_closed: number }> = {}
  for (const r of closerRows) {
    const d = new Date(r.for_date as string)
    const mon = new Date(d)
    mon.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
    const wk = mon.toISOString().slice(0, 10)
    if (!weeklyCloserTrend[wk]) weeklyCloserTrend[wk] = { week: wk, calls_closed: 0 }
    weeklyCloserTrend[wk].calls_closed += r.calls_closed ?? 0
  }
  const closerWeeklyTrend = Object.values(weeklyCloserTrend).sort((a, b) => a.week.localeCompare(b.week))

  // Close rate by closer
  const closerRateMap: Record<string, { uid: string; name: string; calls_closed: number; calls_completed: number; revenue_closed: number; confidence_level_sum: number; confidence_count: number }> = {}
  for (const r of closerRows) {
    const uid  = r.submitted_by as string
    const name = (r.users as { full_name?: string; email?: string } | null)?.full_name
      || (r.users as { email?: string } | null)?.email
      || uid.slice(0, 8)
    if (!closerRateMap[uid]) closerRateMap[uid] = { uid, name, calls_closed: 0, calls_completed: 0, revenue_closed: 0, confidence_level_sum: 0, confidence_count: 0 }
    closerRateMap[uid].calls_closed   += r.calls_closed   ?? 0
    closerRateMap[uid].calls_completed += r.calls_completed ?? 0
    closerRateMap[uid].revenue_closed  += r.revenue_closed ?? 0
    if (r.confidence_level != null) {
      closerRateMap[uid].confidence_level_sum += r.confidence_level as number
      closerRateMap[uid].confidence_count     += 1
    }
  }

  const closerLeaderboard = Object.values(closerRateMap).map((c) => ({
    uid: c.uid,
    name: c.name,
    calls_closed: c.calls_closed,
    calls_completed: c.calls_completed,
    close_rate: c.calls_completed > 0 ? Math.round((c.calls_closed / c.calls_completed) * 100 * 10) / 10 : 0,
    revenue_closed: c.revenue_closed,
    avg_confidence: c.confidence_count > 0 ? Math.round(c.confidence_level_sum / c.confidence_count * 10) / 10 : 0,
  })).sort((a, b) => b.close_rate - a.close_rate)

  const avgCloseRateByCloser = Object.values(closerRateMap).map((c) => ({
    name: c.name,
    close_rate: c.calls_completed > 0 ? Math.round((c.calls_closed / c.calls_completed) * 100 * 10) / 10 : 0,
  }))

  // Closer red flags: confidence < 6 OR close rate < 30%
  const closerRedFlags = closerLeaderboard.filter((c) => c.avg_confidence < 6 || c.close_rate < 30)

  // Activity feed: last 10 closer submissions
  const closerActivity = [...closerRows]
    .sort((a, b) => (b.for_date as string).localeCompare(a.for_date as string) || (b.created_at as string).localeCompare(a.created_at as string))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      for_date: r.for_date,
      name: (r.users as { full_name?: string } | null)?.full_name ?? 'Unknown',
      no_close_reasons: r.no_close_reasons,
      calls_closed: r.calls_closed,
      revenue_closed: r.revenue_closed,
    }))

  return NextResponse.json({
    setter: {
      total_submissions:    totalSetterSubmissions,
      total_active_members: totalActiveSetters,
      eod_completion_rate:  eodCompletionRate,
      total_outbound_attempts: totalOutboundAttempts,
      total_calls_booked:   totalCallsBooked,
      avg_booking_rate:     avgBookingRate,
      avg_response_rate:    avgResponseRate,
      avg_energy_level:     avgEnergyLevel,
      wow_growth_calls_booked: wowGrowthCallsBooked,
      calls_by_setter:      callsBySetter,
      weekly_trend:         setterWeeklyTrend,
      leaderboard:          setterLeaderboard,
      red_flags:            setterRedFlags,
      activity_feed:        setterActivity,
    },
    closer: {
      total_submissions:  totalCloserSubmissions,
      total_calls_completed: totalCallsCompleted,
      total_revenue_closed:  totalRevenueClosed,
      total_cash_collected:  totalCashCollected,
      avg_close_rate:     avgCloseRate,
      avg_show_rate:      avgShowRate,
      no_close_distribution: noCloseDistribution,
      daily_revenue_trend:   dailyRevenueTrend,
      weekly_trend:           closerWeeklyTrend,
      close_rate_by_closer:   avgCloseRateByCloser,
      leaderboard:            closerLeaderboard,
      red_flags:              closerRedFlags,
      activity_feed:          closerActivity,
    },
  })
}
