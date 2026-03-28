/**
 * GET  /api/crm/leads/[id]/notes — fetch all notes for a lead (ASC)
 * POST /api/crm/leads/[id]/notes — add a note to a lead
 */

import { NextResponse } from 'next/server'
import { resolveCrmLead } from '../../../_auth'
import type { LeadNote } from '@/types/crm'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, lead } = resolved

  const { data: notes, error } = await admin
    .from('lead_notes')
    .select('*')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(notes as LeadNote[])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, userId, lead } = resolved

  const body = await req.json() as { note_text?: string }

  if (!body.note_text || typeof body.note_text !== 'string' || body.note_text.trim() === '') {
    return NextResponse.json({ error: 'note_text is required' }, { status: 400 })
  }

  const { data: note, error } = await admin
    .from('lead_notes')
    .insert({
      lead_id: lead.id,
      author_id: userId,
      note_text: body.note_text.trim(),
    })
    .select('*')
    .single()

  if (error || !note) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create note' }, { status: 500 })
  }

  return NextResponse.json(note as LeadNote, { status: 201 })
}
