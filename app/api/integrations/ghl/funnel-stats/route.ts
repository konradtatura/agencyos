/**
 * GET /api/integrations/ghl/funnel-stats
 *
 * Fetches total funnel page view count from GHL Private Integration API.
 * Returns { totalVisitors: number }. On any error returns { totalVisitors: 0 }.
 *
 * Query params: range, from, to (same conventions as /api/metrics/vsl)
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

const EMPTY = { totalVisitors: 0 }

function parseDateRange(range: string, from?: string | null, to?: string | null) {
  const now = new Date()
  function subDays(d: Date, n: number) { return new Date(d.getTime() - n * 86_400_000) }
  function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
  function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
  switch (range) {
    case 'today':  return { fromDate: startOfDay(now), toDate: now }
    case '7d':     return { fromDate: subDays(now, 7), toDate: now }
    case 'month':  return { fromDate: startOfMonth(now), toDate: now }
    case 'all':    return { fromDate: new Date('2020-01-01'), toDate: now }
    case 'custom': return {
      fromDate: from ? new Date(from) : subDays(now, 30),
      toDate:   to   ? new Date(to)   : now,
    }
    default:       return { fromDate: subDays(now, 30), toDate: now }
  }
}

export async function GET(req: NextRequest) {
  const resolved = await resolveCrmUser()
  if ('error' in resolved) return NextResponse.json(EMPTY)

  const { admin, creatorId } = resolved
  if (!creatorId) return NextResponse.json(EMPTY)

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('ghl_api_key, ghl_location_id')
    .eq('id', creatorId)
    .maybeSingle()

  const apiKey     = profile?.ghl_api_key
  const locationId = profile?.ghl_location_id
  if (!apiKey || !locationId) return NextResponse.json(EMPTY)

  const range = req.nextUrl.searchParams.get('range') ?? '30d'
  const from  = req.nextUrl.searchParams.get('from')
  const to    = req.nextUrl.searchParams.get('to')
  const { fromDate, toDate } = parseDateRange(range, from, to)

  const startDate = fromDate.toISOString().slice(0, 10)
  const endDate   = toDate.toISOString().slice(0, 10)

  try {
    const url = new URL('https://services.leadconnectorhq.com/funnels/pageCount')
    url.searchParams.set('locationId', locationId)
    url.searchParams.set('startDate', startDate)
    url.searchParams.set('endDate', endDate)

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-07-28',
      },
      next: { revalidate: 900 }, // 15 min cache
    })

    if (!res.ok) {
      console.warn('[funnel-stats] GHL API error:', res.status, await res.text().catch(() => ''))
      return NextResponse.json(EMPTY)
    }

    const data = await res.json() as { pageCount?: number; count?: number; total?: number }
    const totalVisitors = data.pageCount ?? data.count ?? data.total ?? 0
    return NextResponse.json({ totalVisitors })
  } catch (err) {
    console.warn('[funnel-stats] error:', err)
    return NextResponse.json(EMPTY)
  }
}
