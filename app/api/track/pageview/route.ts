/**
 * POST /api/track/pageview
 *
 * Public endpoint — no auth required.
 * Called from browser via navigator.sendBeacon from GHL funnel pages.
 *
 * Body: { location_id, page_path, page_name, session_id, referrer, visited_at }
 *
 * Looks up creator_id via ghl_location_id on integrations table,
 * then upserts into funnel_pageviews (unique on session_id + page_path).
 * Always returns 200 and never throws visibly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*'
  return {
    'Access-Control-Allow-Origin':      origin,
    'Access-Control-Allow-Methods':     'POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Allow-Credentials': 'false',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(req) })
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req)
  try {
    const body = await req.json()
    const { location_id, page_path, page_name, session_id, referrer, visited_at } = body ?? {}

    // Silently drop requests missing the required fields
    if (!location_id || !page_path || !session_id) {
      return NextResponse.json({ ok: true }, { headers })
    }

    const admin = createAdminClient()

    // Resolve creator_id from location_id
    const { data: integration } = await admin
      .from('integrations')
      .select('creator_id')
      .eq('ghl_location_id', location_id)
      .maybeSingle()

    await admin.from('funnel_pageviews').upsert(
      {
        creator_id:  integration?.creator_id ?? null,
        location_id: String(location_id),
        page_path:   String(page_path),
        page_name:   String(page_name ?? ''),
        session_id:  String(session_id),
        referrer:    String(referrer ?? ''),
        visited_at:  visited_at ?? new Date().toISOString(),
      },
      { onConflict: 'session_id,page_path', ignoreDuplicates: true },
    )
  } catch {
    // Silent failure — never expose errors to client
  }

  return NextResponse.json({ ok: true }, { headers })
}
