/**
 * PATCH /api/revenue/instalments/[id]
 * Mark an instalment as paid (or update status).
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
  const body  = await req.json().catch(() => ({}))

  const update: Record<string, unknown> = {}
  if (body.status) update.status    = body.status
  if (body.status === 'paid') {
    update.paid_date = body.paid_date ?? new Date().toISOString().slice(0, 10)
  }
  if (body.paid_date !== undefined) update.paid_date = body.paid_date

  const { data, error } = await admin
    .from('payment_instalments')
    .update(update)
    .eq('id', params.id)
    .eq('creator_id', creatorId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
