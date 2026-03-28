/**
 * GET    /api/crm/leads/[id]  — fetch lead + stage_history + notes
 * PATCH  /api/crm/leads/[id]  — update allowed lead fields
 * DELETE /api/crm/leads/[id]  — soft-delete: set stage = 'dead'
 */

import { NextResponse } from 'next/server'
import { resolveCrmLead } from '../../_auth'
import type { Lead, LeadWithRelations, OfferTier, LeadSourceType } from '@/types/crm'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, lead } = resolved

  // Fetch stage history (oldest first for timeline display)
  const { data: stageHistory, error: historyError } = await admin
    .from('lead_stage_history')
    .select('*')
    .eq('lead_id', lead.id)
    .order('changed_at', { ascending: true })

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 })
  }

  // Fetch notes (oldest first)
  const { data: notes, error: notesError } = await admin
    .from('lead_notes')
    .select('*')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: true })

  if (notesError) {
    return NextResponse.json({ error: notesError.message }, { status: 500 })
  }

  // Resolve setter and closer display names in one query
  const teamIds = [lead.assigned_setter_id, lead.assigned_closer_id].filter(Boolean) as string[]

  let setterName: string | undefined
  let closerName: string | undefined

  if (teamIds.length > 0) {
    const { data: teamUsers } = await admin
      .from('users')
      .select('id, full_name')
      .in('id', teamIds)

    const userMap = new Map((teamUsers ?? []).map((u) => [u.id as string, u.full_name as string | null]))
    setterName = lead.assigned_setter_id ? (userMap.get(lead.assigned_setter_id) ?? undefined) : undefined
    closerName = lead.assigned_closer_id ? (userMap.get(lead.assigned_closer_id) ?? undefined) : undefined
  }

  const result: LeadWithRelations = {
    ...lead,
    stage_history: stageHistory ?? [],
    notes: notes ?? [],
    setter_name: setterName,
    closer_name: closerName,
  }

  return NextResponse.json(result)
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

const PATCHABLE_FIELDS = [
  'name', 'ig_handle', 'email', 'phone', 'offer_tier',
  'assigned_setter_id', 'assigned_closer_id', 'deal_value',
  'follow_up_date', 'lead_source_type', 'lead_source_id',
  'downgrade_stage',
] as const

const VALID_OFFER_TIERS: OfferTier[] = ['ht', 'mt', 'lt']
const VALID_SOURCE_TYPES: LeadSourceType[] = ['story', 'reel', 'organic', 'manual']
const VALID_DOWNGRADE_STAGES = ['offered', 'interested', 'booked', 'closed', 'dead'] as const

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin } = resolved

  const body = await req.json() as Record<string, unknown>

  const updates: Record<string, unknown> = {}

  for (const field of PATCHABLE_FIELDS) {
    if (field in body) {
      updates[field] = body[field] ?? null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No patchable fields provided' }, { status: 400 })
  }

  // Validate enum fields if provided
  if (updates.offer_tier != null && !VALID_OFFER_TIERS.includes(updates.offer_tier as OfferTier)) {
    return NextResponse.json(
      { error: `offer_tier must be one of: ${VALID_OFFER_TIERS.join(', ')}` },
      { status: 400 },
    )
  }

  if (updates.lead_source_type != null && !VALID_SOURCE_TYPES.includes(updates.lead_source_type as LeadSourceType)) {
    return NextResponse.json(
      { error: `lead_source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  if (updates.downgrade_stage != null && !VALID_DOWNGRADE_STAGES.includes(updates.downgrade_stage as typeof VALID_DOWNGRADE_STAGES[number])) {
    return NextResponse.json(
      { error: `downgrade_stage must be one of: ${VALID_DOWNGRADE_STAGES.join(', ')}` },
      { status: 400 },
    )
  }

  const { data: updated, error: updateError } = await admin
    .from('leads')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(updated as Lead)
}

// ── DELETE (soft) ─────────────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, userId, lead } = resolved

  if (lead.stage === 'dead') {
    return NextResponse.json({ success: true })
  }

  const { error: updateError } = await admin
    .from('leads')
    .update({ stage: 'dead' })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await admin.from('lead_stage_history').insert({
    lead_id: lead.id,
    from_stage: lead.stage,
    to_stage: 'dead',
    changed_by: userId,
    note: 'Lead deleted',
  })

  return NextResponse.json({ success: true })
}
