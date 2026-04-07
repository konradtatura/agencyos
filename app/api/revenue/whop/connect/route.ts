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

  if (!creatorId) {
    console.error('[whop/connect] creatorId is null — cannot save credentials')
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // Encrypt key — fall back to plain prefix if ENCRYPTION_KEY not configured
  let encrypted: string
  try {
    encrypted = encrypt(apiKey)
  } catch {
    console.warn('[whop/connect] ENCRYPTION_KEY not set — storing API key unencrypted')
    encrypted = `plain:${apiKey}`
  }

  const updates: Record<string, unknown> = { whop_api_key_enc: encrypted }
  if (companyId !== null) updates.whop_company_id = companyId

  console.log('[whop/connect] saving to creator_profiles id:', creatorId, 'company_id:', companyId)

  const { data: updated, error: dbErr } = await admin
    .from('creator_profiles')
    .update(updates)
    .eq('id', creatorId)
    .select('id, whop_company_id')
    .maybeSingle()

  if (dbErr) {
    console.error('[whop/connect] DB error:', dbErr.message, dbErr.details, dbErr.hint)
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  if (!updated) {
    console.error('[whop/connect] update matched no rows for creator_profiles id:', creatorId)
    return NextResponse.json({ error: 'Creator profile not found — update matched no rows' }, { status: 404 })
  }

  console.log('[whop/connect] saved successfully, row id:', updated.id)

  return NextResponse.json({ success: true, company_id: updated.whop_company_id ?? companyId })
}
