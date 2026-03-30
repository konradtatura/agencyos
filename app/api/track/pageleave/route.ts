/**
 * POST /api/track/pageleave
 *
 * Public endpoint — no auth required.
 * Called from browser via navigator.sendBeacon on window beforeunload.
 *
 * Body: { session_id, page_path, time_on_page_seconds }
 *
 * Inserts into page_leave_events table.
 * Always returns 200 and never throws visibly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const headers = CORS_HEADERS
  try {
    const body = await req.json()
    const { session_id, page_path, time_on_page_seconds } = body ?? {}

    if (!session_id || !page_path) {
      return NextResponse.json({ ok: true }, { headers })
    }

    const admin = createAdminClient()

    await admin.from('page_leave_events').insert({
      session_id:           String(session_id),
      page_path:            String(page_path),
      time_on_page_seconds: Math.max(0, Math.round(Number(time_on_page_seconds) || 0)),
    })
  } catch {
    // Silent failure — never expose errors to client
  }

  return NextResponse.json({ ok: true }, { headers })
}
