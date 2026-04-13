/**
 * GET  /api/creator/funnel-config — fetch creator's funnel_config
 * PATCH /api/creator/funnel-config — update creator's funnel_config
 *
 * Uses resolveCrmUser so super_admins (with or without impersonation) and
 * creators all resolve to the correct creator_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

async function resolveCreatorId() {
  const resolved = await resolveCrmUser()
  if ('error' in resolved) return { creatorId: null, errorResponse: resolved.error }

  const { admin, userId, role, creatorId: directCreatorId } = resolved

  let creatorId: string | null = directCreatorId

  // super_admin impersonating is already converted to role:'creator' by resolveCrmUser,
  // so this branch only runs for a non-impersonating super_admin — fall back to first profile
  if (role === 'super_admin' && !creatorId) {
    const { data: first } = await admin
      .from('creator_profiles')
      .select('id')
      .order('created_at')
      .limit(1)
      .maybeSingle()
    creatorId = first?.id ?? null
  }

  // setter / closer → resolve via team membership
  if ((role === 'setter' || role === 'closer') && !creatorId) {
    const { data: member } = await admin
      .from('team_members')
      .select('creator_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    creatorId = member?.creator_id ?? null
  }

  return { creatorId, admin, errorResponse: null }
}

export async function GET() {
  const { creatorId, admin, errorResponse } = await resolveCreatorId()

  if (errorResponse) return errorResponse
  if (!creatorId) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const { data } = await admin
    .from('creator_profiles')
    .select('funnel_config')
    .eq('id', creatorId)
    .maybeSingle()

  return NextResponse.json({ funnel_config: data?.funnel_config ?? {} })
}

export async function PATCH(req: NextRequest) {
  const { creatorId, admin, errorResponse } = await resolveCreatorId()

  if (errorResponse) return errorResponse
  if (!creatorId) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const body = await req.json() as { funnel_config?: unknown }
  if (!body.funnel_config) {
    return NextResponse.json({ error: 'funnel_config required' }, { status: 400 })
  }

  const { error } = await admin
    .from('creator_profiles')
    .update({ funnel_config: body.funnel_config })
    .eq('id', creatorId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ funnel_config: body.funnel_config })
}
