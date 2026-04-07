/**
 * GET /api/revenue/whop/status
 *
 * Returns current Whop connection state from creator_profiles.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../../crm/_auth'

export async function GET() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (!creatorId && role !== 'super_admin') {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('whop_api_key_enc, whop_last_synced_at, whop_company_id')
    .eq('id', creatorId!)
    .maybeSingle()

  return NextResponse.json({
    connected:   !!profile?.whop_api_key_enc,
    last_synced: profile?.whop_last_synced_at ?? null,
    company_id:  profile?.whop_company_id     ?? null,
  })
}
