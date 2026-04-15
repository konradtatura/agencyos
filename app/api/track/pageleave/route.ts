import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const { session_id, page_path, time_on_page_seconds } = body as Record<string, unknown>

  if (!session_id || !page_path) {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('page_leave_events').insert({
    session_id:           String(session_id),
    page_path:            String(page_path),
    time_on_page_seconds: Number(time_on_page_seconds ?? 0),
  })

  if (error) console.error('[track/pageleave] insert error:', error)

  return NextResponse.json({ ok: true })
}
