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
 * with all_views, unique_views, and conversion_to_next percentage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── Types ──────────────────────────────────────────────────────────────────

export interface FunnelStep {
  page_name: string
  all_views: number
  unique_views: number
  conversion_to_next: number | null
}

export interface DailyPoint {
  date: string
  [key: string]: number | string
}

export interface FunnelMetricsResponse {
  steps: FunnelStep[]
  page_names: string[]
  daily_views: DailyPoint[]
}

// ── Date helpers ───────────────────────────────────────────────────────────

function subDays(d: Date, n: number) { return new Date(d.getTime() - n * 86_400_000) }
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

function parseDateRange(range: string, from?: string | null, to?: string | null) {
  const now = new Date()
  switch (range) {
    case 'today':  return { fromDate: startOfDay(now),      toDate: now }
    case '7d':     return { fromDate: subDays(now, 7),      toDate: now }
    case 'month':  return { fromDate: startOfMonth(now),    toDate: now }
    case 'all':    return { fromDate: new Date('2020-01-01'), toDate: now }
    case 'custom': return {
      fromDate: from ? new Date(from) : subDays(now, 30),
      toDate:   to   ? new Date(to)   : now,
    }
    default:       return { fromDate: subDays(now, 30), toDate: now } // 30d
  }
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
    return NextResponse.json({ steps: [], page_names: [], daily_views: [] } satisfies FunnelMetricsResponse)
  }

  // Parse date range
  const range = req.nextUrl.searchParams.get('range') ?? '30d'
  const from  = req.nextUrl.searchParams.get('from')
  const to    = req.nextUrl.searchParams.get('to')
  const { fromDate, toDate } = parseDateRange(range, from, to)

  // Fetch raw pageview rows
  const { data: rows } = await admin
    .from('funnel_pageviews')
    .select('page_name, session_id, visited_at')
    .eq('creator_id', creatorId)
    .gte('visited_at', fromDate.toISOString())
    .lte('visited_at', toDate.toISOString())

  if (!rows || rows.length === 0) {
    return NextResponse.json({ steps: [], page_names: [], daily_views: [] } satisfies FunnelMetricsResponse)
  }

  // Aggregate by page_name
  type PageAgg = { sessions: Set<string>; totalViews: number; sumTime: number }
  const pageMap = new Map<string, PageAgg>()

  for (const row of rows) {
    const name = row.page_name || 'home'
    const agg = pageMap.get(name) ?? { sessions: new Set(), totalViews: 0, sumTime: 0 }
    agg.sessions.add(row.session_id)
    agg.totalViews++
    agg.sumTime += new Date(row.visited_at).getTime()
    pageMap.set(name, agg)
  }

  // Sort steps by average visited_at ascending (funnel order)
  const sorted = [...pageMap.entries()].sort((a, b) => {
    return (a[1].sumTime / a[1].totalViews) - (b[1].sumTime / b[1].totalViews)
  })

  const steps: FunnelStep[] = sorted.map(([page_name, agg]) => ({
    page_name,
    all_views:           agg.totalViews,
    unique_views:        agg.sessions.size,
    conversion_to_next:  null,
  }))

  // Fill conversion_to_next
  for (let i = 0; i < steps.length - 1; i++) {
    const curr = steps[i].unique_views
    const next = steps[i + 1].unique_views
    steps[i].conversion_to_next = curr > 0
      ? Math.round((next / curr) * 1000) / 10
      : null
  }

  const page_names = steps.map(s => s.page_name)

  // Build daily unique views: date → page_name → Set<session_id>
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

  return NextResponse.json({ steps, page_names, daily_views } satisfies FunnelMetricsResponse)
}
