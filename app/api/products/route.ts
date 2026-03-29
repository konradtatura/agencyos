/**
 * GET /api/products — list active products for the current user's creator workspace
 *
 * Works for all roles: creator, setter, closer, super_admin.
 * Setters and closers resolve their creator via team_members.
 * Super admin can pass ?creator_id=<uuid> to target a specific creator.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

export async function GET(req: NextRequest) {
  const resolved = await resolveCrmUser()
  if ('error' in resolved) return resolved.error

  const { admin, userId, role, creatorId: directCreatorId } = resolved

  let creatorId: string | null = directCreatorId

  if (role === 'setter' || role === 'closer') {
    const { data: member } = await admin
      .from('team_members')
      .select('creator_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()

    creatorId = member?.creator_id ?? null
  }

  if (role === 'super_admin') {
    const param = req.nextUrl.searchParams.get('creator_id')
    if (param) creatorId = param
  }

  if (!creatorId) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('products')
    .select('id, name, tier, payment_type, price')
    .eq('creator_id', creatorId)
    .eq('active', true)
    .order('tier')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
