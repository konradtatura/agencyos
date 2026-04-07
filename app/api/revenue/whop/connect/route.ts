/**
 * GET  /api/revenue/whop/connect  — connection status
 * POST /api/revenue/whop/connect  — validate key and store encrypted
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../../crm/_auth'
import { encrypt } from '@/lib/crypto'

// ── GET — connection status ───────────────────────────────────────────────────

export async function GET() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (!creatorId && role !== 'super_admin') {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('whop_api_key_enc, whop_last_synced_at')
    .eq('id', creatorId!)
    .maybeSingle()

  return NextResponse.json({
    connected:     !!profile?.whop_api_key_enc,
    last_synced_at: profile?.whop_last_synced_at ?? null,
  })
}

// ── POST — validate + store key ───────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (!creatorId && role !== 'super_admin') {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const body = await req.json() as { api_key?: string }
  const apiKey = body.api_key?.trim()

  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 })
  }

  // Validate with Whop API — 401 means bad key, anything else (200, 403, …) means key is recognised
  const whopRes = await fetch('https://api.whop.com/api/v1/memberships', {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => null)

  if (!whopRes) {
    return NextResponse.json({ error: 'Could not reach Whop API' }, { status: 502 })
  }

  if (whopRes.status === 401) {
    return NextResponse.json(
      { error: 'Invalid Whop API key — authentication rejected by Whop.' },
      { status: 422 },
    )
  }

  // Encrypt and store
  let encrypted: string
  try {
    encrypted = encrypt(apiKey)
  } catch (e) {
    // ENCRYPTION_KEY not set — store as plaintext with warning prefix
    console.warn('[whop/connect] ENCRYPTION_KEY not set — storing API key unencrypted')
    encrypted = `plain:${apiKey}`
  }

  const { error: dbErr } = await admin
    .from('creator_profiles')
    .update({ whop_api_key_enc: encrypted })
    .eq('id', creatorId!)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
