/**
 * GET /api/metrics/funnel — Page-view funnel metrics
 *
 * Query params:
 *   range:      today | 7d | 30d | month | all | custom  (same as VSL route)
 *   from:       ISO string (custom range only)
 *   to:         ISO string (custom range only)
 *   creator_id: uuid (super_admin only — override)
 *
 * Returns funnel steps ordered by avg visited_at ascending,
 * with all_views, unique_views, conversion_to_next percentage,
 * device_breakdown, top_referrers, avg_time_on_page_seconds,
 * plus overall totals: total_visitors, prev_total_visitors,
 * returning_visitors, peak_hour, overall_device_breakdown,
 * overall_referrers, and country_breakdown (top 10).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DeviceBreakdown {
  desktop: number
  mobile: number
  tablet: number
}

export interface ReferrerCount {
  source: string
  count: number
}

export interface CountryCount {
  country: string
  count: number
}

export interface FunnelStep {
  page_name: string
  all_views: number
  unique_views: number
  conversion_to_next: number | null
  device_breakdown: DeviceBreakdown
  top_referrers: ReferrerCount[]
  avg_time_on_page_seconds: number | null
}

export interface DailyPoint {
  date: string
  [key: string]: number | string
}

export interface FunnelMetricsResponse {
  steps: FunnelStep[]
  page_names: string[]
  daily_views: DailyPoint[]
  total_visitors: number
  prev_total_visitors: number
  returning_visitors: number
  peak_hour: number | null
  overall_device_breakdown: DeviceBreakdown
  overall_referrers: ReferrerCount[]
  country_breakdown: CountryCount[]
}

// ── Date helpers ───────────────────────────────────────────────────────────

function subDays(d: Date, n: number) { return new Date(d.getTime() - n * 86_400_000) }
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

function parseDateRange(range: string, from?: string | null, to?: string | null) {
  const now = new Date()
  switch (range) {
    case 'today':  return { fromDate: startOfDay(now),       toDate: now }
    case '7d':     return { fromDate: subDays(now, 7),       toDate: now }
    case 'month':  return { fromDate: startOfMonth(now),     toDate: now }
    case 'all':    return { fromDate: new Date('2020-01-01'), toDate: now }
    case 'custom': return {
      fromDate: from ? new Date(from) : subDays(now, 30),
      toDate:   to   ? new Date(to)   : now,
    }
    default:       return { fromDate: subDays(now, 30), toDate: now } // 30d
  }
}

const EMPTY: FunnelMetricsResponse = {
  steps: [], page_names: [], daily_views: [],
  total_visitors: 0, prev_total_visitors: 0,
  returning_visitors: 0, peak_hour: null,
  overall_device_breakdown: { desktop: 0, mobile: 0, tablet: 0 },
  overall_referrers: [],
  country_breakdown: [],
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const resolved = await resolveCrmUser()
  if ('error' in resolved) return resolved.error

  const { admin, userId, role, creatorId: directCreatorId } = resolved

  // Resolve creator
  let creatorId: string | null = directCreatorId
  if (role === 'super_admin') {
    const param = req.nextUrl.searchParams.get('creator_id')
    if (param) {
      creatorId = param
    } else {
      const { data: first } = await admin
        .from('creator_profiles')
        .select('id')
        .order('created_at')
        .limit(1)
        .maybeSingle()
      creatorId = first?.id ?? null
    }
  }
  if (role === 'setter' || role === 'closer') {
    const { data: member } = await admin
      .from('team_members')
      .select('creator_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    creatorId = member?.creator_id ?? null
  }

  if (!creatorId) {
    return NextResponse.json(EMPTY satisfies FunnelMetricsResponse)
  }

  // Parse date range
  const range = req.nextUrl.searchParams.get('range') ?? '30d'
  const from  = req.nextUrl.searchParams.get('from')
  const to    = req.nextUrl.searchParams.get('to')
  const { fromDate, toDate } = parseDateRange(range, from, to)

  // Fetch raw pageview rows (include new enrichment fields)
  const [{ data: rows }, { data: leaveRows }, { data: prevRows }] = await Promise.all([
    admin
      .from('funnel_pageviews')
      .select('page_name, page_path, session_id, visited_at, device_type, referrer_source, country')
      .eq('creator_id', creatorId)
      .gte('visited_at', fromDate.toISOString())
      .lte('visited_at', toDate.toISOString()),

    // page_leave_events fetched lazily after we know session_ids — skip pre-fetching here
    Promise.resolve({ data: null }),

    // Previous period visitor count for KPI comparison
    range === 'all'
      ? Promise.resolve({ data: null })
      : admin
          .from('funnel_pageviews')
          .select('session_id')
          .eq('creator_id', creatorId)
          .gte('visited_at', new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime())).toISOString())
          .lt('visited_at', fromDate.toISOString()),
  ])

  void leaveRows // fetched below after session_ids known

  if (!rows || rows.length === 0) {
    const prev_total_visitors = new Set(prevRows?.map((r: { session_id: string }) => r.session_id) ?? []).size
    return NextResponse.json({ ...EMPTY, prev_total_visitors } satisfies FunnelMetricsResponse)
  }

  // Fetch page_leave_events for sessions in this dataset
  const sessionIds = Array.from(new Set(rows.map(r => r.session_id)))
  const { data: leaveData } = await admin
    .from('page_leave_events')
    .select('session_id, page_path, time_on_page_seconds')
    .in('session_id', sessionIds)

  // Build leave lookup: page_path → [time_on_page_seconds]
  const leaveTimes = new Map<string, number[]>()
  for (const lr of leaveData ?? []) {
    const key = lr.page_path
    if (!leaveTimes.has(key)) leaveTimes.set(key, [])
    leaveTimes.get(key)!.push(lr.time_on_page_seconds)
  }

  // ── Per-session first-touch attribution ────────────────────────────────────
  // Count each session's device/referrer/country once (first pageview wins)
  const sessionDevice   = new Map<string, string>()
  const sessionReferrer = new Map<string, string>()
  const sessionCountry  = new Map<string, string>()

  for (const row of rows) {
    if (!sessionDevice.has(row.session_id)) {
      sessionDevice.set(row.session_id,   (row.device_type      as string | null) ?? 'desktop')
      sessionReferrer.set(row.session_id, (row.referrer_source  as string | null) ?? 'direct')
      sessionCountry.set(row.session_id,  (row.country          as string | null) ?? '')
    }
  }

  // ── Aggregate by page_name ─────────────────────────────────────────────────
  type PageAgg = {
    sessions: Set<string>
    pagePaths: Set<string>
    totalViews: number
    devices: DeviceBreakdown
    referrers: Map<string, number>
  }
  const pageMap = new Map<string, PageAgg>()

  for (const row of rows) {
    const name = row.page_name || 'home'
    const agg = pageMap.get(name) ?? {
      sessions: new Set(),
      pagePaths: new Set(),
      totalViews: 0,
      devices: { desktop: 0, mobile: 0, tablet: 0 },
      referrers: new Map(),
    }
    agg.sessions.add(row.session_id)
    agg.pagePaths.add(row.page_path)
    agg.totalViews++

    const dt = (row.device_type as string | null) ?? 'desktop'
    if (dt === 'mobile') agg.devices.mobile++
    else if (dt === 'tablet') agg.devices.tablet++
    else agg.devices.desktop++

    const src = (row.referrer_source as string | null) ?? 'direct'
    agg.referrers.set(src, (agg.referrers.get(src) ?? 0) + 1)

    pageMap.set(name, agg)
  }

  // Sort steps by unique visitors descending — most-visited page is top of funnel
  const sorted = [...pageMap.entries()].sort((a, b) => b[1].sessions.size - a[1].sessions.size)

  const steps: FunnelStep[] = sorted.map(([page_name, agg]) => {
    const times: number[] = []
    for (const path of agg.pagePaths) {
      times.push(...(leaveTimes.get(path) ?? []))
    }
    const avg_time = times.length > 0
      ? Math.round(times.reduce((s, t) => s + t, 0) / times.length)
      : null

    const top_referrers: ReferrerCount[] = [...agg.referrers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }))

    return {
      page_name,
      all_views:                agg.totalViews,
      unique_views:             agg.sessions.size,
      conversion_to_next:       null,
      device_breakdown:         agg.devices,
      top_referrers,
      avg_time_on_page_seconds: avg_time,
    }
  })

  // Fill conversion_to_next
  for (let i = 0; i < steps.length - 1; i++) {
    const curr = steps[i].unique_views
    const next = steps[i + 1].unique_views
    steps[i].conversion_to_next = curr > 0
      ? Math.round((next / curr) * 1000) / 10
      : null
  }

  const page_names = steps.map(s => s.page_name)

  // ── Daily unique views ─────────────────────────────────────────────────────
  const dayPageSessions = new Map<string, Map<string, Set<string>>>()
  for (const row of rows) {
    const date = row.visited_at.slice(0, 10)
    const name = row.page_name || 'home'
    if (!dayPageSessions.has(date)) dayPageSessions.set(date, new Map())
    const dpMap = dayPageSessions.get(date)!
    if (!dpMap.has(name)) dpMap.set(name, new Set())
    dpMap.get(name)!.add(row.session_id)
  }

  const daily_views: DailyPoint[] = [...dayPageSessions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dpMap]) => {
      const point: DailyPoint = { date }
      for (const name of page_names) {
        point[name] = dpMap.get(name)?.size ?? 0
      }
      return point
    })

  // ── Overall stats ──────────────────────────────────────────────────────────
  const sessionPageCount = new Map<string, number>()
  const hourCounts = new Array<number>(24).fill(0)
  for (const row of rows) {
    sessionPageCount.set(row.session_id, (sessionPageCount.get(row.session_id) ?? 0) + 1)
    hourCounts[new Date(row.visited_at).getHours()]++
  }

  const total_visitors     = sessionPageCount.size
  const returning_visitors = Array.from(sessionPageCount.values()).filter(n => n >= 2).length
  const maxHourCount       = Math.max(...hourCounts)
  const peak_hour          = maxHourCount > 0 ? hourCounts.indexOf(maxHourCount) : null

  // ── Overall device / referrer / country (per-session) ─────────────────────
  const overallDevices: DeviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 }
  sessionDevice.forEach(dt => {
    if (dt === 'mobile') overallDevices.mobile++
    else if (dt === 'tablet') overallDevices.tablet++
    else overallDevices.desktop++
  })

  const refMap = new Map<string, number>()
  sessionReferrer.forEach(src => {
    refMap.set(src, (refMap.get(src) ?? 0) + 1)
  })
  const overall_referrers: ReferrerCount[] = Array.from(refMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }))

  const countryMap = new Map<string, number>()
  sessionCountry.forEach(c => {
    if (c) countryMap.set(c, (countryMap.get(c) ?? 0) + 1)
  })
  const country_breakdown: CountryCount[] = Array.from(countryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }))

  // ── Previous period visitor count ──────────────────────────────────────────
  const prev_total_visitors = new Set(
    prevRows?.map((r: { session_id: string }) => r.session_id) ?? []
  ).size

  return NextResponse.json({
    steps,
    page_names,
    daily_views,
    total_visitors,
    prev_total_visitors,
    returning_visitors,
    peak_hour,
    overall_device_breakdown:  overallDevices,
    overall_referrers,
    country_breakdown,
  } satisfies FunnelMetricsResponse)
}
