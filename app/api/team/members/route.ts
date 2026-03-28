/**
 * GET /api/team/members?role=setter|closer
 *
 * Returns active team members for the caller's creator workspace.
 * Setters and closers can see their own entry; creators see their full team.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../crm/_auth'

export async function GET(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult
  const { searchParams } = new URL(req.url)
  const filterRole = searchParams.get('role')

  let targetCreatorId = creatorId

  if (role === 'super_admin') {
    targetCreatorId = searchParams.get('creator_id')
    if (!targetCreatorId) {
      return NextResponse.json({ error: 'creator_id is required for super_admin' }, { status: 400 })
    }
  }

  if (!targetCreatorId) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // Fetch team member records
  let tmQuery = admin
    .from('team_members')
    .select('user_id, role')
    .eq('creator_id', targetCreatorId)
    .eq('active', true)

  if (filterRole) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tmQuery = (tmQuery as any).eq('role', filterRole)
  }

  const { data: members, error: membersError } = await tmQuery

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  if (!members || members.length === 0) {
    return NextResponse.json([])
  }

  // Fetch user details for each member
  const userIds = members.map((m) => m.user_id as string)

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, full_name, email')
    .in('id', userIds)

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]))

  const result = members.map((m) => {
    const u = userMap.get(m.user_id as string)
    return {
      id: m.user_id as string,
      role: m.role as string,
      full_name: (u?.full_name as string | null) ?? null,
      email: (u?.email as string | null) ?? null,
    }
  })

  return NextResponse.json(result)
}
