/**
 * GET  /api/admin/tally/key  — returns whether a key is configured (masked)
 * POST /api/admin/tally/key  — saves (or rotates) the agency Tally API key
 *
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tallyEncrypt } from '@/lib/tally/encryption'

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
      .from('agency_settings')
      .select('updated_at')
      .eq('key', 'tally_api_key')
      .maybeSingle()

    if (dbError) {
      console.error('[tally/key GET] db error:', dbError.message)
      // Table may not exist yet — treat as not configured
      return NextResponse.json({ configured: false, updated_at: null })
    }

    return NextResponse.json({
      configured: !!data,
      updated_at: data?.updated_at ?? null,
    })
  } catch (err) {
    console.error('[tally/key GET] unexpected error:', err)
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

    // Check encryption key is available before hitting Tally
    if (!process.env.TALLY_ENCRYPTION_KEY) {
      console.error('[tally/key POST] TALLY_ENCRYPTION_KEY env var is not set')
      return NextResponse.json({
        success: false,
        error: 'Server configuration error: TALLY_ENCRYPTION_KEY is not set. Add it to Railway environment variables.',
      })
    }

    // Validate the key against Tally API
    try {
      const tallyRes = await fetch('https://api.tally.so/forms', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!tallyRes.ok) {
        console.warn('[tally/key POST] Tally rejected key, status:', tallyRes.status)
        return NextResponse.json({ success: false, error: 'Invalid API key — Tally rejected it' })
      }
    } catch (fetchErr) {
      console.error('[tally/key POST] failed to reach Tally API:', fetchErr)
      return NextResponse.json({ success: false, error: 'Failed to reach Tally API' })
    }

    // Encrypt the key
    let encrypted: string
    try {
      encrypted = tallyEncrypt(apiKey)
    } catch (encErr) {
      console.error('[tally/key POST] encryption failed:', encErr)
      return NextResponse.json({
        success: false,
        error: 'Encryption failed — check TALLY_ENCRYPTION_KEY is a valid 64-character hex string',
      })
    }

    // Upsert into agency_settings
    const admin = createAdminClient()
    const { error: dbError } = await admin
      .from('agency_settings')
      .upsert(
        { key: 'tally_api_key', value: encrypted, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )

    if (dbError) {
      console.error('[tally/key POST] db upsert error:', dbError.message, dbError.code)
      return NextResponse.json({
        success: false,
        error: `Database error: ${dbError.message}`,
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[tally/key POST] unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
