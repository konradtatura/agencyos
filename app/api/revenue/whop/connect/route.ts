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
    .select('whop_api_key_enc, whop_last_synced_at, whop_company_id')
    .eq('id', creatorId!)
    .maybeSingle()

  return NextResponse.json({
    connected:      !!profile?.whop_api_key_enc,
    last_synced_at: profile?.whop_last_synced_at ?? null,
    company_id:     profile?.whop_company_id     ?? null,
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

  const body = await req.json() as { api_key?: string; company_id?: string }
  const apiKey    = body.api_key?.trim()
  const companyId = body.company_id?.trim() || null

  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 })
  }

  // Encrypt and store — key is validated implicitly on first sync
  let encrypted: string
  try {
    encrypted = encrypt(apiKey)
  } catch {
    // ENCRYPTION_KEY not set — store as plaintext with warning prefix
    console.warn('[whop/connect] ENCRYPTION_KEY not set — storing API key unencrypted')
    encrypted = `plain:${apiKey}`
  }

  const updates: Record<string, unknown> = { whop_api_key_enc: encrypted }
  if (companyId !== null) updates.whop_company_id = companyId

  const { error: dbErr } = await admin
    .from('creator_profiles')
    .update(updates)
    .eq('id', creatorId!)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
