/**
 * GET  /api/revenue/products  — list products
 * POST /api/revenue/products  — create product
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../crm/_auth'
import type { Product } from '@/types/revenue'

export async function GET() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (!creatorId && role !== 'super_admin') {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('products')
    .select('*')
    .eq('creator_id', creatorId!)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data ?? []) as Product[])
}

export async function POST(req: Request) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (role === 'setter' || role === 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    name?:            string
    tier?:            string
    payment_type?:    string
    price?:           number
    whop_product_id?: string
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!['ht', 'mt', 'lt'].includes(body.tier ?? '')) {
    return NextResponse.json({ error: 'tier must be ht | mt | lt' }, { status: 400 })
  }
  if (!['onetime', 'recurring', 'plan'].includes(body.payment_type ?? '')) {
    return NextResponse.json({ error: 'payment_type must be onetime | recurring | plan' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('products')
    .insert({
      creator_id:      creatorId!,
      name:            body.name.trim(),
      tier:            body.tier,
      payment_type:    body.payment_type,
      price:           body.price ?? 0,
      whop_product_id: body.whop_product_id ?? null,
      active:          true,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data as Product, { status: 201 })
}
