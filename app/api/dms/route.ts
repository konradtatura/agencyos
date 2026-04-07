/**
 * GET /api/dms
 *
 * List conversations for the caller's creator workspace.
 * Query params:
 *   status=new|qualifying|...  (filter by single status)
 *   search=text                (filter by ig_username ilike)
 *   unread_only=true           (only rows where unread_count > 0)
 */

import { NextResponse } from 'next/server'
import { resolveDmUser } from './_auth'

export async function GET(req: Request) {
  const authResult = await resolveDmUser()
  if ('error' in authResult) return authResult.error

  const { admin, userId, role, creatorId } = authResult
  const { searchParams } = new URL(req.url)

  const statusFilter  = searchParams.get('status')
  const search        = searchParams.get('search')
  const unreadOnly    = searchParams.get('unread_only') === 'true'

  let query = admin
    .from('dm_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  // ── Role-based scoping ───────────────────────────────────────────────────────
  if (role === 'super_admin') {
    // super_admin not impersonating has no creatorId — return empty rather than all
    if (!creatorId) return NextResponse.json([])
    query = query.eq('creator_id', creatorId)
  } else if (role === 'creator') {
    query = query.eq('creator_id', creatorId!)
  } else if (role === 'setter') {
    // Setter sees assigned + unassigned rows for their creator
    const { data: memberships } = await admin
      .from('team_members')
      .select('creator_id')
      .eq('user_id', userId)

    const creatorIds = (memberships ?? []).map((m) => m.creator_id as string)
    if (creatorIds.length === 0) return NextResponse.json([])

    query = query
      .in('creator_id', creatorIds)
      .or(`assigned_setter_id.eq.${userId},assigned_setter_id.is.null`)
  } else {
    return NextResponse.json([])
  }

  // ── Filters ──────────────────────────────────────────────────────────────────
  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  if (search) {
    query = query.ilike('ig_username', `%${search}%`)
  }

  if (unreadOnly) {
    query = query.gt('unread_count', 0)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/dms] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
