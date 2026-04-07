/**
 * GET /api/revenue/whop/status
 *
 * Returns current Whop connection state from creator_profiles.
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

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
