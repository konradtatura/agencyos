/**
 * GET /api/revenue/roas?window=all_time|current_month|rolling_7d|current_week
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RoasMetrics } from '@/types/revenue'

function windowDates(window: string): { from: string | null; to: string } {
  const now    = new Date()
  const todayS = now.toISOString().slice(0, 10)

  if (window === 'current_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return { from, to: todayS }
  }
  if (window === 'rolling_7d') {
    const from = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    return { from, to: todayS }
  }
  if (window === 'current_week') {
    const day  = now.getDay()                    // 0=Sun
    const diff = (day === 0 ? 6 : day - 1)       // Mon=0
    const from = new Date(now.getTime() - diff * 86_400_000).toISOString().slice(0, 10)
    return { from, to: todayS }
  }
  return { from: null, to: todayS }
}

export async function GET(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin  = createAdminClient()
  const window = req.nextUrl.searchParams.get('window') ?? 'all_time'
  const { from, to } = windowDates(window)

  // Sales (revenue)
  let salesQuery = admin
    .from('sales')
    .select('amount')
    .eq('creator_id', creatorId)
  if (from) salesQuery = salesQuery.gte('sale_date', from)
  salesQuery = salesQuery.lte('sale_date', to)

  // Expenses
  let expQuery = admin
    .from('expenses')
    .select('amount, category')
    .eq('creator_id', creatorId)
  if (from) expQuery = expQuery.gte('date', from)
  expQuery = expQuery.lte('date', to)

  // Lead conversions — leads that reached 'showed' or 'closed_won'
  let bookedQuery = admin
    .from('lead_stage_history')
    .select('lead_id')
    .eq('to_stage', 'showed')
    .in('lead_id',
      // scope to creator's leads
      (await admin.from('leads').select('id').eq('creator_id', creatorId)).data?.map(l => l.id) ?? ['00000000-0000-0000-0000-000000000000']
    )
  if (from) bookedQuery = bookedQuery.gte('changed_at', from + 'T00:00:00Z')

  let closedQuery = admin
    .from('leads')
    .select('id')
    .eq('creator_id', creatorId)
    .eq('stage', 'closed_won')

  const [salesRes, expRes, bookedRes, closedRes] = await Promise.all([
    salesQuery,
    expQuery,
    bookedQuery,
    closedQuery,
  ])

  const totalRevenue    = (salesRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const totalAdSpend    = (expRes.data ?? []).filter(r => r.category === 'ad_spend').reduce((s, r) => s + Number(r.amount), 0)
  const totalExpenses   = (expRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const bookedCallIds   = new Set((bookedRes.data ?? []).map(r => r.lead_id))
  const bookedCalls     = bookedCallIds.size
  const totalConversions= (closedRes.data ?? []).length

  const metrics: RoasMetrics = {
    booked_calls:      bookedCalls,
    total_revenue:     totalRevenue,
    avg_cpbc:          bookedCalls     > 0 ? totalAdSpend / bookedCalls     : 0,
    net_revenue:       totalRevenue - totalExpenses,
    total_roas:        totalAdSpend    > 0 ? totalRevenue / totalAdSpend    : 0,
    aov:               totalConversions > 0 ? totalRevenue / totalConversions : 0,
    total_ad_spend:    totalAdSpend,
    total_conversions: totalConversions,
    avg_cpa:           totalConversions > 0 ? totalAdSpend / totalConversions : 0,
    total_expenses:    totalExpenses,
  }

  return NextResponse.json(metrics)
}
