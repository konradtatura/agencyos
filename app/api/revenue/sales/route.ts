/**
 * GET  /api/revenue/sales  — list sales with filters
 * POST /api/revenue/sales  — create a manual sale
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Sale } from '@/types/revenue'

function dateRangeFrom(range: string | null): string | null {
  if (!range || range === 'all') return null
  const now = new Date()
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10)
  }
  if (range === '7d') {
    return new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  }
  if (range === '30d') {
    return new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
  // Custom: expect 'YYYY-MM-DD' passed directly
  return range
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const { searchParams } = new URL(req.url)
  const range    = searchParams.get('range')
  const platform = searchParams.get('platform')
  const tier     = searchParams.get('tier')   // HT/MT/LT (filters via product join)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('sales')
    .select('*, product:products(tier, name), closer:users(full_name)')
    .eq('creator_id', creatorId)
    .order('sale_date', { ascending: false })

  const fromDate = dateRangeFrom(range)
  if (fromDate) query = query.gte('sale_date', fromDate)

  if (platform) query = query.eq('platform', platform)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter by tier in JS (FK join can't be filtered at DB level easily)
  let sales = (data ?? []) as Array<Sale & { product: { tier: string | null; name: string | null } | null }>
  if (tier) {
    sales = sales.filter((s) => s.product?.tier === tier)
  }

  return NextResponse.json(sales)
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const body = await req.json() as {
    product_id?:       string
    product_name?:     string
    amount?:           number
    payment_type?:     string
    sale_date?:        string
    lead_id?:          string
    closer_id?:        string
    notes?:            string
    lead_source_type?: string
  }

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  }
  if (!body.payment_type) {
    return NextResponse.json({ error: 'payment_type is required' }, { status: 400 })
  }
  if (!['upfront', 'instalment', 'recurring'].includes(body.payment_type)) {
    return NextResponse.json({ error: 'payment_type must be upfront | instalment | recurring' }, { status: 400 })
  }

  // Resolve product_name snapshot
  let productName = body.product_name ?? null
  if (body.product_id && !productName) {
    const { data: p } = await admin
      .from('products')
      .select('name')
      .eq('id', body.product_id)
      .maybeSingle()
    productName = (p?.name as string | null) ?? null
  }

  const { data: sale, error } = await admin
    .from('sales')
    .insert({
      creator_id:       creatorId,
      lead_id:          body.lead_id          ?? null,
      product_id:       body.product_id       ?? null,
      product_name:     productName,
      amount:           body.amount,
      platform:         'manual',
      payment_type:     body.payment_type,
      sale_date:        body.sale_date        ?? new Date().toISOString().slice(0, 10),
      closer_id:        body.closer_id        ?? null,
      notes:            body.notes            ?? null,
      lead_source_type: body.lead_source_type ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(sale as Sale, { status: 201 })
}
