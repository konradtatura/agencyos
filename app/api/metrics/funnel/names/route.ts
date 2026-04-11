/**
 * GET /api/metrics/funnel/names
 *
 * Returns distinct funnel_name values for the authenticated creator.
 * Used to populate the funnel selector dropdown on the Metrics page.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

export async function GET() {
  const resolved = await resolveCrmUser()
  if ('error' in resolved) return resolved.error

  const { admin, userId, role, creatorId: directCreatorId } = resolved

  let creatorId: string | null = directCreatorId

  if (role === 'super_admin') {
    const { data: first } = await admin
      .from('creator_profiles')
      .select('id')
      .order('created_at')
      .limit(1)
      .maybeSingle()
    creatorId = first?.id ?? null
  }

  if (role === 'setter' || role === 'closer') {
    const { data: member } = await admin
      .from('team_members')
      .select('creator_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    creatorId = member?.creator_id ?? null
  }

  if (!creatorId) {
    return NextResponse.json({ names: [] })
  }

  try {
    const { data, error } = await admin
      .from('funnel_pageviews')
      .select('funnel_name')
      .eq('creator_id', creatorId)
      .not('funnel_name', 'is', null)

    if (error) {
      // Column may not exist yet — return empty gracefully
      console.warn('[funnel/names] query error (column may not exist):', error.message)
      return NextResponse.json({ names: [] })
    }

    const names = [...new Set(
      (data ?? [])
        .map((r: { funnel_name: string | null }) => r.funnel_name)
        .filter((n): n is string => !!n)
    )].sort()

    return NextResponse.json({ names })
  } catch (e) {
    console.warn('[funnel/names] unexpected error:', e)
    return NextResponse.json({ names: [] })
  }
}
