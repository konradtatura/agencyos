/**
 * GET  /api/revenue/expenses
 * POST /api/revenue/expenses
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin   = createAdminClient()
  const params  = req.nextUrl.searchParams
  const from    = params.get('from')
  const to      = params.get('to')

  let query = admin
    .from('expenses')
    .select('*')
    .eq('creator_id', creatorId)
    .order('date', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to)   query = query.lte('date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body  = await req.json()

  const { data, error } = await admin
    .from('expenses')
    .insert({
      creator_id:  creatorId,
      category:    body.category,
      description: body.description || null,
      amount:      body.amount,
      date:        body.date,
      platform:    body.platform || null,
      notes:       body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
