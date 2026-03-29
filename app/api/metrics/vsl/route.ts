/**
 * GET /api/metrics/vsl — VSL funnel conversion metrics
 *
 * Query params:
 *   range:      today | 7d | 30d | month | all | custom
 *   from:       ISO string (custom range only)
 *   to:         ISO string (custom range only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── Types ──────────────────────────────────────────────────────────────────

export interface LeadSummary {
  id: string
  name: string
  stage: string
  ig_handle: string | null
  email: string | null
  phone: string | null
  closer_id: string | null
  closer_name: string | null
  deal_value: number | null
  booked_at: string | null
  created_at: string
}

export interface PeriodStats {
  booked: number
  showed: number
  closed_won: number
  closed_lost: number
  no_show: number
  pending: number
  revenue: number
  avg_deal: number
  show_rate: number
  close_rate: number
  no_show_rate: number
  end_to_end: number
}

export interface CloserStats {
  closer_id: string
  closer_name: string
  booked: number
  showed: number
  closed_won: number
  show_rate: number
  close_rate: number
  revenue: number
  avg_deal: number
  prev_close_rate: number
  trend: 'up' | 'down' | 'flat'
}

export interface VslMetricsResponse {
  period: { from: string; to: string; prev_from: string; prev_to: string; label: string }
  current: PeriodStats
  previous: PeriodStats
  leads: LeadSummary[]
  per_closer: CloserStats[]
  ad_spend: number | null
}

// ── Date helpers ───────────────────────────────────────────────────────────

function subDays(d: Date, n: number) { return new Date(d.getTime() - n * 86_400_000) }
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }

function parseDateRange(range: string, from?: string | null, to?: string | null) {
  const now = new Date()

  switch (range) {
    case 'today': return {
      curFrom: startOfDay(now), curTo: now,
      prevFrom: startOfDay(subDays(now, 1)), prevTo: endOfDay(subDays(now, 1)),
      label: 'Today vs Yesterday',
    }
    case '7d': return {
      curFrom: subDays(now, 7), curTo: now,
      prevFrom: subDays(now, 14), prevTo: subDays(now, 7),
      label: 'Last 7 days vs Prior 7',
    }
    case '30d': return {
      curFrom: subDays(now, 30), curTo: now,
      prevFrom: subDays(now, 60), prevTo: subDays(now, 30),
      label: 'Last 30 days vs Prior 30',
    }
    case 'month': {
      const prevMonthDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return {
        curFrom: startOfMonth(now), curTo: now,
        prevFrom: startOfMonth(prevMonthDay), prevTo: endOfMonth(prevMonthDay),
        label: 'This month vs Last month',
      }
    }
    case 'all': return {
      curFrom: new Date('2020-01-01'), curTo: now,
      prevFrom: new Date('2020-01-01'), prevTo: new Date('2020-01-01'),
      label: 'All time',
    }
    case 'custom': {
      const curFrom = from ? new Date(from) : subDays(now, 30)
      const curTo   = to   ? new Date(to)   : now
      const duration = curTo.getTime() - curFrom.getTime()
      return {
        curFrom, curTo,
        prevFrom: new Date(curFrom.getTime() - duration), prevTo: curFrom,
        label: 'Custom range',
      }
    }
    default: return {
      curFrom: subDays(now, 30), curTo: now,
      prevFrom: subDays(now, 60), prevTo: subDays(now, 30),
      label: 'Last 30 days vs Prior 30',
    }
  }
}

// ── Metric computation ─────────────────────────────────────────────────────

interface RawLead {
  id: string; name: string; stage: string; ig_handle: string | null
  email: string | null; phone: string | null; assigned_closer_id: string | null
  deal_value: number | null; booked_at: string | null; created_at: string
}

function computeStats(leads: RawLead[]): PeriodStats {
  const booked     = leads.length
  const closed_won = leads.filter(l => l.stage === 'closed_won').length
  const closed_lost = leads.filter(l => l.stage === 'closed_lost').length
  const no_show    = leads.filter(l => l.stage === 'no_show').length
  const showed     = closed_won + closed_lost
  const pending    = leads.filter(l => l.stage === 'call_booked').length
  const revenue    = leads.filter(l => l.stage === 'closed_won').reduce((s, l) => s + (l.deal_value ?? 0), 0)
  const wonWithVal  = leads.filter(l => l.stage === 'closed_won' && (l.deal_value ?? 0) > 0)
  const avg_deal   = wonWithVal.length ? revenue / wonWithVal.length : 0
  const show_rate  = booked ? (showed / booked) * 100 : 0
  const close_rate = showed ? (closed_won / showed) * 100 : 0
  const no_show_rate = booked ? (no_show / booked) * 100 : 0
  const end_to_end   = booked ? (closed_won / booked) * 100 : 0
  return { booked, showed, closed_won, closed_lost, no_show, pending, revenue, avg_deal, show_rate, close_rate, no_show_rate, end_to_end }
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
      const { data: first } = await admin.from('creator_profiles').select('id').order('created_at').limit(1).maybeSingle()
      creatorId = first?.id ?? null
    }
  }
  if (role === 'setter' || role === 'closer') {
    const { data: member } = await admin.from('team_members').select('creator_id').eq('user_id', userId).eq('active', true).maybeSingle()
    creatorId = member?.creator_id ?? null
  }
  if (!creatorId) return NextResponse.json({ error: 'Creator not found' }, { status: 404 })

  const range      = req.nextUrl.searchParams.get('range') ?? '30d'
  const customFrom = req.nextUrl.searchParams.get('from')
  const customTo   = req.nextUrl.searchParams.get('to')

  const { curFrom, curTo, prevFrom, prevTo, label } = parseDateRange(range, customFrom, customTo)

  // Fetch current + previous period leads in one query (filter client-side to avoid two round-trips)
  const fetchFrom = range === 'all' ? curFrom : prevFrom
  const { data: allLeads, error: leadsErr } = await admin
    .from('leads')
    .select('id, name, stage, ig_handle, email, phone, assigned_closer_id, deal_value, booked_at, created_at')
    .eq('creator_id', creatorId)
    .eq('lead_source_type', 'vsl_funnel')
    .gte('created_at', fetchFrom.toISOString())
    .lte('created_at', curTo.toISOString())
    .order('created_at', { ascending: false })

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })

  const raw = (allLeads ?? []) as RawLead[]
  const curLeads  = raw.filter(l => new Date(l.created_at) >= curFrom)
  const prevLeads = raw.filter(l => new Date(l.created_at) >= prevFrom && new Date(l.created_at) < curFrom)

  // Closer name lookup
  const allCloserIds = Array.from(new Set(raw.map(l => l.assigned_closer_id).filter(Boolean))) as string[]
  const closerNameMap = new Map<string, string>()
  if (allCloserIds.length > 0) {
    const { data: users } = await admin.from('users').select('id, email').in('id', allCloserIds)
    for (const u of users ?? []) {
      closerNameMap.set(u.id, (u.email as string).split('@')[0])
    }
  }

  // Build lead summaries (current period only)
  const leads: LeadSummary[] = curLeads.map(l => ({
    id: l.id, name: l.name, stage: l.stage, ig_handle: l.ig_handle,
    email: l.email, phone: l.phone,
    closer_id: l.assigned_closer_id,
    closer_name: l.assigned_closer_id ? (closerNameMap.get(l.assigned_closer_id) ?? 'Unknown') : null,
    deal_value: l.deal_value, booked_at: l.booked_at, created_at: l.created_at,
  }))

  // Per-closer stats
  const closerIds = Array.from(new Set([...curLeads, ...prevLeads].map(l => l.assigned_closer_id).filter(Boolean))) as string[]
  const per_closer: CloserStats[] = closerIds.map(cid => {
    const curC  = curLeads.filter(l => l.assigned_closer_id === cid)
    const prevC = prevLeads.filter(l => l.assigned_closer_id === cid)
    const cur   = computeStats(curC)
    const prev  = computeStats(prevC)
    const name  = closerNameMap.get(cid) ?? 'Unknown'
    const trend: 'up' | 'down' | 'flat' = prev.close_rate === 0 ? 'flat' : cur.close_rate > prev.close_rate ? 'up' : cur.close_rate < prev.close_rate ? 'down' : 'flat'
    return {
      closer_id: cid, closer_name: name,
      booked: cur.booked, showed: cur.showed, closed_won: cur.closed_won,
      show_rate: cur.show_rate, close_rate: cur.close_rate,
      revenue: cur.revenue, avg_deal: cur.avg_deal,
      prev_close_rate: prev.close_rate, trend,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // Ad spend (most recent entry in current period)
  const { data: adSpendRow } = await admin
    .from('ad_spend')
    .select('amount')
    .eq('creator_id', creatorId)
    .lte('date_from', curTo.toISOString().split('T')[0])
    .gte('date_to', curFrom.toISOString().split('T')[0])
    .order('date_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  const response: VslMetricsResponse = {
    period: {
      from: curFrom.toISOString(), to: curTo.toISOString(),
      prev_from: prevFrom.toISOString(), prev_to: prevTo.toISOString(),
      label,
    },
    current:  computeStats(curLeads),
    previous: computeStats(prevLeads),
    leads,
    per_closer,
    ad_spend: adSpendRow?.amount ?? null,
  }

  return NextResponse.json(response)
}
