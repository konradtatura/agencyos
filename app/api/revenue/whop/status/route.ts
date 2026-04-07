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

  if (!creatorId) {
    console.error('[whop/status] creatorId is null')
    return NextResponse.json({ connected: false, last_synced: null, company_id: null })
  }

  const { data: profile, error: dbErr } = await admin
    .from('creator_profiles')
    .select('whop_api_key_enc, whop_last_synced_at, whop_company_id')
    .eq('id', creatorId)
    .maybeSingle()

  if (dbErr) {
    console.error('[whop/status] DB error:', dbErr.message)
  }

  console.log('[whop/status] creator_profiles id:', creatorId,
    'has_key:', !!profile?.whop_api_key_enc,
    'company_id:', profile?.whop_company_id ?? null,
  )

  return NextResponse.json({
    connected:   !!profile?.whop_api_key_enc && profile.whop_api_key_enc.length > 0,
    last_synced: profile?.whop_last_synced_at ?? null,
    company_id:  profile?.whop_company_id ?? null,
  })
}
