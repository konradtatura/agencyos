/**
 * POST /api/track/pageview
 *
 * Public endpoint — no auth required.
 * Called from browser via fetch from GHL funnel pages.
 *
 * Body: { location_id, page_path, page_name, session_id, referrer, visited_at,
 *         device_type, referrer_source }
 *
 * Looks up creator_id via ghl_location_id on integrations table,
 * then upserts into funnel_pageviews (unique on session_id + page_path).
 * Resolves country from request IP via ipapi.co (fire-and-forget, non-blocking).
 * Always returns 200 and never exposes errors to client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ── Country lookup ──────────────────────────────────────────────────────────

const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|localhost)/

async function lookupCountry(ip: string): Promise<string | null> {
  if (!ip || PRIVATE_IP_RE.test(ip)) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const res = await fetch(`https://ipapi.co/${ip}/country/`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'agencyos/1.0' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text.length === 2 ? text.toUpperCase() : null
  } catch {
    return null
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const headers = CORS_HEADERS

  console.log('[pageview] request received', req.method, req.url)

  let body: Record<string, unknown> | null = null
  try {
    body = await req.json()
  } catch (e) {
    console.error('[pageview] failed to parse JSON body:', e)
    return NextResponse.json({ ok: true }, { headers })
  }

  console.log('[pageview] payload:', JSON.stringify(body))

  const {
    location_id, page_path, page_name, session_id, referrer, visited_at,
    device_type, referrer_source,
  } = body ?? {}

  if (!location_id || !page_path || !session_id) {
    console.log('[pageview] dropped — missing required field(s):', { location_id, page_path, session_id })
    return NextResponse.json({ ok: true }, { headers })
  }

  try {
    // Country lookup is fire-and-forget — don't let it block the insert
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : (req.headers.get('x-real-ip') ?? '')
    const country = await lookupCountry(ip)
    console.log('[pageview] ip:', ip, '→ country:', country)

    const admin = createAdminClient()

    // Resolve creator_id from location_id
    const { data: integration, error: intErr } = await admin
      .from('integrations')
      .select('creator_id')
      .eq('ghl_location_id', location_id)
      .maybeSingle()

    if (intErr) console.error('[pageview] integration lookup error:', intErr)
    console.log('[pageview] integration:', integration)

    const row = {
      creator_id:       integration?.creator_id ?? null,
      location_id:      String(location_id),
      page_path:        String(page_path),
      page_name:        String(page_name ?? ''),
      session_id:       String(session_id),
      referrer:         String(referrer ?? ''),
      visited_at:       visited_at ?? new Date().toISOString(),
      device_type:      device_type ? String(device_type) : null,
      referrer_source:  referrer_source ? String(referrer_source) : null,
      country:          country,
    }

    console.log('[pageview] upserting row:', JSON.stringify(row))

    const { error: upsertError } = await admin
      .from('funnel_pageviews')
      .upsert(row, { onConflict: 'session_id,page_path', ignoreDuplicates: true })

    if (upsertError) {
      console.error('[pageview] upsert error:', JSON.stringify(upsertError))
    } else {
      console.log('[pageview] upsert success')
    }
  } catch (e) {
    console.error('[pageview] unexpected error:', e)
  }

  return NextResponse.json({ ok: true }, { headers })
}
