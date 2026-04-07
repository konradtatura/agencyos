/**
 * GET /api/admin/overview
 * Super-admin only. Returns agency-wide rollup stats.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function GET() {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const admin = createAdminClient()

  const now       = new Date()
  const mtdStart  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const today     = now.toISOString().slice(0, 10)

  const DEAD_STAGES = ['dead', 'closed_lost', 'disqualified']

  const [salesRes, leadsRes, historyRes] = await Promise.all([
    // All sales this month
    admin
      .from('sales')
      .select('amount, payment_type')
      .gte('sale_date', mtdStart)
      .lte('sale_date', today),

    // All leads with stage info
    admin
      .from('leads')
      .select('stage'),

    // Stage history this month (for booked calls MTD)
    admin
      .from('lead_stage_history')
      .select('to_stage')
      .eq('to_stage', 'call_booked')
      .gte('changed_at', `${mtdStart}T00:00:00Z`),
  ])

  const sales   = salesRes.data   ?? []
  const leads   = leadsRes.data   ?? []
  const history = historyRes.data ?? []

  const total_mrr = sales
    .filter((s) => s.payment_type === 'recurring')
    .reduce((sum, s) => sum + Number(s.amount), 0)

  const cash_collected_mtd = sales
    .reduce((sum, s) => sum + Number(s.amount), 0)

  const active_leads = leads.filter((l) => !DEAD_STAGES.includes(l.stage)).length

  const booked_calls_mtd = history.length

  // Per-creator close + show rates (from all-time leads)
  const creatorsRes = await admin
    .from('leads')
    .select('creator_id, stage')

  const creatorLeads = creatorsRes.data ?? []

  // Group by creator
  const byCreator: Record<string, { showed: number; closed_won: number; call_booked: number }> = {}
  for (const lead of creatorLeads) {
    const id = lead.creator_id as string
    if (!byCreator[id]) byCreator[id] = { showed: 0, closed_won: 0, call_booked: 0 }
    if (lead.stage === 'showed')     byCreator[id].showed++
    if (lead.stage === 'closed_won') byCreator[id].closed_won++
    if (['call_booked', 'showed', 'closed_won', 'closed_lost', 'no_show'].includes(lead.stage)) {
      byCreator[id].call_booked++
    }
  }

  const creatorRates = Object.values(byCreator).map((c) => ({
    close_rate: c.showed > 0 ? (c.closed_won / c.showed) * 100 : null,
    show_rate:  c.call_booked > 0 ? ((c.showed + c.closed_won) / c.call_booked) * 100 : null,
  }))

  const closeRates = creatorRates.map((r) => r.close_rate).filter((r): r is number => r !== null)
  const showRates  = creatorRates.map((r) => r.show_rate).filter((r): r is number => r !== null)

  const avg_close_rate = closeRates.length > 0
    ? Math.round(closeRates.reduce((a, b) => a + b, 0) / closeRates.length * 10) / 10
    : 0

  const avg_show_rate = showRates.length > 0
    ? Math.round(showRates.reduce((a, b) => a + b, 0) / showRates.length * 10) / 10
    : 0

  return NextResponse.json({
    total_mrr:           Math.round(total_mrr * 100) / 100,
    cash_collected_mtd:  Math.round(cash_collected_mtd * 100) / 100,
    active_leads,
    booked_calls_mtd,
    avg_close_rate,
    avg_show_rate,
  })
}
