/**
 * GET  /api/forms/eod?date=2026-04-07&role=setter
 *   Returns today's submission for the logged-in user if it exists.
 *
 * POST /api/forms/eod
 *   Upserts an EOD submission for the logged-in user.
 *   Body: { role, for_date, ...fields }
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, userId } = authResult
  const { searchParams } = new URL(req.url)

  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const role = searchParams.get('role')

  if (!role || !['setter', 'closer'].includes(role)) {
    return NextResponse.json({ error: 'role must be setter or closer' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('eod_submissions')
    .select('*')
    .eq('submitted_by', userId)
    .eq('for_date', date)
    .eq('role', role)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, userId, role: userRole } = authResult

  // Only setters and closers submit EOD forms (creators/admins can submit on behalf — allow all)
  const body = await req.json() as Record<string, unknown>

  const { role, for_date, ...fields } = body as {
    role: string
    for_date: string
    [key: string]: unknown
  }

  if (!role || !['setter', 'closer'].includes(role)) {
    return NextResponse.json({ error: 'role must be setter or closer' }, { status: 400 })
  }

  if (!for_date) {
    return NextResponse.json({ error: 'for_date is required' }, { status: 400 })
  }

  // Setters can only submit setter forms, closers only closer forms
  // Creators and admins can submit any
  if (userRole === 'setter' && role !== 'setter') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (userRole === 'closer' && role !== 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Build allowed fields based on role
  const setterFields = [
    'calls_booked', 'outbound_sent', 'inbound_received', 'outbound_booked_q',
    'inbound_booked_q', 'dq_forms', 'booking_links_sent', 'downsell_cash',
  ]
  const closerFields = [
    'calls_booked', 'showed', 'canceled', 'disqualified', 'rescheduled',
    'followup_shown', 'followup_closed', 'closes', 'cash_collected', 'revenue',
  ]
  const allowed = role === 'setter' ? setterFields : closerFields
  const filtered: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in fields) filtered[key] = fields[key]
  }

  const { data, error } = await admin
    .from('eod_submissions')
    .upsert(
      {
        submitted_by: userId,
        for_date,
        role,
        ...filtered,
      },
      { onConflict: 'submitted_by,for_date,role' }
    )
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 200 })
}
