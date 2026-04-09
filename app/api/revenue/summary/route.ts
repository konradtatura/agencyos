/**
 * GET /api/revenue/summary?range=30d|7d|today|month|all
 *
 * Returns aggregated revenue metrics for the creator's dashboard.
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RevenueSummary } from '@/types/revenue'

function dateFrom(range: string | null): string | null {
  if (!range || range === 'all') return null
  const now = new Date()
  if (range === 'today')  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10)
  if (range === '7d')     return new Date(now.getTime() -  7 * 86_400_000).toISOString().slice(0, 10)
  if (range === '30d')    return new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  if (range === 'month')  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  // Custom date string
  return range
}

function fmtMonth(dateStr: string): string {
  // Returns "Jan 25" format
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export async function GET(req: Request) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const { searchParams } = new URL(req.url)
  const range    = searchParams.get('range') ?? '30d'
  const fromDate = dateFrom(range)

  // ── Fetch all sales in range with product + closer join ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('sales')
    .select('amount, payment_type, sale_date, platform, lead_source_type, closer_id, product_id, product:products(tier), closer:users(full_name)')
    .eq('creator_id', creatorId)

  if (fromDate) query = query.gte('sale_date', fromDate)

  const { data: sales, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type SaleRow = {
    amount:           number
    payment_type:     string
    sale_date:        string
    platform:         string
    lead_source_type: string | null
    closer_id:        string | null
    product_id:       string | null
    product:          { tier: string | null } | null
    closer:           { full_name: string | null } | null
  }

  const rows = (sales ?? []) as SaleRow[]

  // ── Period bounds ──────────────────────────────────────────────────────────
  const now     = new Date()
  const from    = fromDate ?? (rows.length ? rows[rows.length - 1].sale_date : now.toISOString().slice(0, 10))
  const to      = now.toISOString().slice(0, 10)

  // ── Aggregations ──────────────────────────────────────────────────────────

  const cashCollected = rows.reduce((s, r) => s + Number(r.amount), 0)
  const totalSales    = rows.length
  const avgDealValue  = totalSales > 0 ? cashCollected / totalSales : 0

  // MRR = sum of all recurring sales (simplistic — each recurring sale = monthly revenue)
  const mrr    = rows.filter((r) => r.payment_type === 'recurring').reduce((s, r) => s + Number(r.amount), 0)
  const newMrr = mrr  // all recurring in period considered "new" for now

  // By tier
  const tierMap = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const tier = r.product?.tier ?? 'unknown'
    const cur  = tierMap.get(tier) ?? { total: 0, count: 0 }
    tierMap.set(tier, { total: cur.total + Number(r.amount), count: cur.count + 1 })
  }
  const byTier = Array.from(tierMap.entries()).map(([tier, v]) => ({ tier, ...v }))

  // By platform
  const platformMap = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const p   = r.platform
    const cur = platformMap.get(p) ?? { total: 0, count: 0 }
    platformMap.set(p, { total: cur.total + Number(r.amount), count: cur.count + 1 })
  }
  const byPlatform = Array.from(platformMap.entries()).map(([platform, v]) => ({ platform, ...v }))

  // By closer
  const closerMap = new Map<string, { name: string | null; total: number; count: number }>()
  for (const r of rows) {
    const key  = r.closer_id ?? '__none__'
    const name = r.closer?.full_name ?? null
    const cur  = closerMap.get(key) ?? { name, total: 0, count: 0 }
    closerMap.set(key, { name, total: cur.total + Number(r.amount), count: cur.count + 1 })
  }
  const byCloser = Array.from(closerMap.entries())
    .map(([closer_id, v]) => ({
      closer_id:   closer_id === '__none__' ? null : closer_id,
      closer_name: v.name,
      total:       v.total,
      count:       v.count,
      avg:         v.count > 0 ? v.total / v.count : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // By source
  const sourceMap = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const src = r.lead_source_type ?? 'unknown'
    const cur = sourceMap.get(src) ?? { total: 0, count: 0 }
    sourceMap.set(src, { total: cur.total + Number(r.amount), count: cur.count + 1 })
  }
  const bySource = Array.from(sourceMap.entries()).map(([source, v]) => ({ source, ...v }))

  // Monthly breakdown (last 12 months)
  const monthlyMap = new Map<string, { ht: number; mt: number; lt: number; total: number }>()
  // Seed last 12 months in order
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = fmtMonth(d.toISOString())
    monthlyMap.set(key, { ht: 0, mt: 0, lt: 0, total: 0 })
  }
  for (const r of rows) {
    const key = fmtMonth(r.sale_date)
    const cur = monthlyMap.get(key) ?? { ht: 0, mt: 0, lt: 0, total: 0 }
    const amt = Number(r.amount)
    const tier = r.product?.tier ?? 'lt'
    const upd = { ...cur, total: cur.total + amt }
    if (tier === 'ht') upd.ht = cur.ht + amt
    else if (tier === 'mt') upd.mt = cur.mt + amt
    else upd.lt = cur.lt + amt
    monthlyMap.set(key, upd)
  }
  const monthly = Array.from(monthlyMap.entries()).map(([month, v]) => ({ month, ...v }))

  console.log('[revenue/summary] fromDate:', fromDate, '| totalSales:', rows.length, '| recurringCount:', rows.filter((r) => r.payment_type === 'recurring').length)

  const summary: RevenueSummary = {
    period:       { from, to },
    cashCollected,
    mrr,
    newMrr,
    avgDealValue,
    totalSales,
    byTier,
    byPlatform,
    byCloser,
    bySource,
    monthly,
  }

  return NextResponse.json(summary)
}
