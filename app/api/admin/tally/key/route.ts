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
  const user = await assertSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('agency_settings')
    .select('updated_at')
    .eq('key', 'tally_api_key')
    .maybeSingle()

  return NextResponse.json({
    configured:  !!data,
    updated_at:  data?.updated_at ?? null,
  })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await assertSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let apiKey: string
  try {
    const body = await req.json() as { api_key?: string }
    apiKey = (body.api_key ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 })
  }

  // Validate against Tally before saving
  try {
    const res = await fetch('https://api.tally.so/forms', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Invalid API key — Tally rejected it' })
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to reach Tally API' })
  }

  const encrypted = tallyEncrypt(apiKey)
  const admin = createAdminClient()

  const { error } = await admin
    .from('agency_settings')
    .upsert(
      { key: 'tally_api_key', value: encrypted, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
