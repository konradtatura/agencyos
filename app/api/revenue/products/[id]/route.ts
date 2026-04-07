/**
 * PATCH  /api/revenue/products/[id]  — update product
 * DELETE /api/revenue/products/[id]  — delete product
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../../crm/_auth'
import type { Product } from '@/types/revenue'

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (role === 'setter' || role === 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>
  const allowed = ['name', 'tier', 'payment_type', 'price', 'whop_product_id', 'active']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await admin
    .from('products')
    .update(updates)
    .eq('id', params.id)
    .eq('creator_id', creatorId!)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  return NextResponse.json(data as Product)
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (role === 'setter' || role === 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check for dependent sales
  const { count } = await admin
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${count} sale(s) reference this product` },
      { status: 409 },
    )
  }

  const { error } = await admin
    .from('products')
    .delete()
    .eq('id', params.id)
    .eq('creator_id', creatorId!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
