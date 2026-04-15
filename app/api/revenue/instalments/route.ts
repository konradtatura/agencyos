/**
 * GET /api/revenue/instalments
 * Returns all payment instalments for the creator, with sale + lead + closer joins.
 * Optional: ?status=overdue or status=pending
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin  = createAdminClient()
  const status = req.nextUrl.searchParams.get('status')

  // Auto-mark overdue: if due_date < today and status is still 'pending', consider it overdue
  const today = new Date().toISOString().slice(0, 10)

  // First, bulk-update overdue instalments
  await admin
    .from('payment_instalments')
    .update({ status: 'overdue' })
    .eq('creator_id', creatorId)
    .eq('status', 'pending')
    .lt('due_date', today)

  let query = admin
    .from('payment_instalments')
    .select(`
      *,
      sale:sales(
        product_name,
        closer_id,
        lead:leads(name),
        closer:users(full_name)
      )
    `)
    .eq('creator_id', creatorId)

  if (status) {
    // Allow comma-separated list: status=pending,overdue
    const statuses = status.split(',')
    if (statuses.length === 1) {
      query = query.eq('status', statuses[0])
    } else {
      query = query.in('status', statuses)
    }
  }

  query = query.order('due_date', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalize nested join arrays
  const normalized = (data ?? []).map(row => ({
    ...row,
    sale: Array.isArray(row.sale) ? row.sale[0] ?? null : row.sale,
  }))

  return NextResponse.json(normalized)
}
