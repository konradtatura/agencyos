/**
 * GET  /api/admin/ghl/key  — returns whether a GHL API key is configured (masked)
 * POST /api/admin/ghl/key  — saves (or rotates) the agency GHL API key
 *
 * Super-admin only. Stored in agency_config.ghl_api_key (single-row table).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'super_admin') return null
  return user
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await assertSuperAdmin()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const { data, error: dbError } = await admin
      .from('agency_config')
      .select('ghl_api_key, updated_at')
      .limit(1)
      .maybeSingle()

    if (dbError) {
      console.error('[ghl/key GET]', dbError.message)
      return NextResponse.json({ configured: false, updated_at: null })
    }

    return NextResponse.json({
      configured: !!data?.ghl_api_key,
      updated_at: data?.updated_at ?? null,
    })
  } catch (err) {
    console.error('[ghl/key GET] unexpected:', err)
    return NextResponse.json({ configured: false, updated_at: null })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const user = await assertSuperAdmin()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let apiKey: string
    try {
      const body = await req.json() as { api_key?: string }
      apiKey = (body.api_key ?? '').trim()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'api_key is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // agency_config is a single-row table — update the existing row
    const { error: dbError } = await admin
      .from('agency_config')
      .update({ ghl_api_key: apiKey, updated_at: new Date().toISOString() })
      .not('id', 'is', null) // match the single row

    if (dbError) {
      console.error('[ghl/key POST] db error:', dbError.message)
      return NextResponse.json({ success: false, error: `Database error: ${dbError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ghl/key POST] unexpected:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
