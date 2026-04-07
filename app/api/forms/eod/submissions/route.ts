/**
 * GET /api/forms/eod/submissions
 *   Creator/admin only — returns all submissions joined with user name.
 *   Query params: ?role=setter|closer&from=2026-04-01&to=2026-04-07&user_id=uuid
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

export async function GET(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role } = authResult

  // Only creators and admins can view all submissions
  if (role === 'setter' || role === 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const roleFilter   = searchParams.get('role')
  const from         = searchParams.get('from')
  const to           = searchParams.get('to')
  const userId       = searchParams.get('user_id')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = admin
    .from('eod_submissions')
    .select(`
      *,
      users!eod_submissions_submitted_by_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .order('for_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (roleFilter && ['setter', 'closer'].includes(roleFilter)) {
    query = query.eq('role', roleFilter) as typeof query
  }
  if (from) query = query.gte('for_date', from) as typeof query
  if (to)   query = query.lte('for_date', to) as typeof query
  if (userId) query = query.eq('submitted_by', userId) as typeof query

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
