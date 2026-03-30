/**
 * POST /api/track/pageview
 *
 * Public endpoint — no auth required.
 * Called from browser via navigator.sendBeacon from GHL funnel pages.
 *
 * Body: { location_id, page_path, page_name, session_id, referrer, visited_at,
 *         device_type, referrer_source }
 *
 * Looks up creator_id via ghl_location_id on integrations table,
 * then upserts into funnel_pageviews (unique on session_id + page_path).
 * Resolves country from request IP via ipapi.co.
 * Always returns 200 and never throws visibly.
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
  try {
    const body = await req.json()
    const {
      location_id, page_path, page_name, session_id, referrer, visited_at,
      device_type, referrer_source,
    } = body ?? {}

    // Silently drop requests missing the required fields
    if (!location_id || !page_path || !session_id) {
      return NextResponse.json({ ok: true }, { headers })
    }

    // Resolve IP → country (non-blocking with timeout)
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : (req.headers.get('x-real-ip') ?? '')
    const country = await lookupCountry(ip)

    const admin = createAdminClient()

    // Resolve creator_id from location_id
    const { data: integration } = await admin
      .from('integrations')
      .select('creator_id')
      .eq('ghl_location_id', location_id)
      .maybeSingle()

    await admin.from('funnel_pageviews').upsert(
      {
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
      },
      { onConflict: 'session_id,page_path', ignoreDuplicates: true },
    )
  } catch {
    // Silent failure — never expose errors to client
  }

  return NextResponse.json({ ok: true }, { headers })
}
