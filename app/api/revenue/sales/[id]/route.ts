/**
 * PATCH  /api/revenue/sales/[id]  — update a sale
 * DELETE /api/revenue/sales/[id]  — delete a sale
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const body = await req.json() as Record<string, unknown>

  const allowedFields = [
    'product_id', 'product_name', 'amount', 'payment_type',
    'sale_date', 'lead_id', 'closer_id', 'notes', 'lead_source_type',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await admin
    .from('sales')
    .update(updates)
    .eq('id', params.id)
    .eq('creator_id', creatorId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const { error } = await admin
    .from('sales')
    .delete()
    .eq('id', params.id)
    .eq('creator_id', creatorId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
