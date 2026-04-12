/**
 * GET  /api/creator/funnel-config — fetch creator's funnel_config
 * PATCH /api/creator/funnel-config — update creator's funnel_config
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('creator_profiles')
    .select('funnel_config')
    .eq('id', creatorId)
    .maybeSingle()

  return NextResponse.json({ funnel_config: data?.funnel_config ?? {} })
}

export async function PATCH(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { funnel_config?: unknown }
  if (!body.funnel_config) {
    return NextResponse.json({ error: 'funnel_config required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('creator_profiles')
    .update({ funnel_config: body.funnel_config })
    .eq('id', creatorId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ funnel_config: body.funnel_config })
}
