/**
 * GET  /api/revenue/funnel-snapshots?window=all_time|current_month|rolling_7d|current_week
 * POST /api/revenue/funnel-snapshots
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

function windowFrom(window: string): string | null {
  const now = new Date()
  if (window === 'current_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
  if (window === 'rolling_7d') {
    return new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  }
  if (window === 'current_week') {
    const day  = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    return new Date(now.getTime() - diff * 86_400_000).toISOString().slice(0, 10)
  }
  return null // all_time
}

export async function GET(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin  = createAdminClient()
  const window = req.nextUrl.searchParams.get('window') ?? 'all_time'
  const from   = windowFrom(window)

  let query = admin
    .from('funnel_snapshots')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })

  if (from) query = query.gte('date_from', from)

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
    .from('funnel_snapshots')
    .insert({ creator_id: creatorId, ...body })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
