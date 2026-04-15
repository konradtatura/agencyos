/**
 * PATCH  /api/revenue/expenses/[id]
 * DELETE /api/revenue/expenses/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body  = await req.json()

  const { data, error } = await admin
    .from('expenses')
    .update({
      category:    body.category,
      description: body.description || null,
      amount:      body.amount,
      date:        body.date,
      platform:    body.platform || null,
      notes:       body.notes || null,
    })
    .eq('id', params.id)
    .eq('creator_id', creatorId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { error } = await admin
    .from('expenses')
    .delete()
    .eq('id', params.id)
    .eq('creator_id', creatorId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
