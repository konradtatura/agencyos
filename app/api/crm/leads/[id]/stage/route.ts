/**
 * POST /api/crm/leads/[id]/stage — move a lead to a new stage
 *
 * Body: { to_stage: string, note?: string, pipeline?: 'main' | 'downgrade' }
 *
 * Validates to_stage against the creator's pipeline_stages rows rather than
 * a hardcoded list. Falls back to allowing any string if no stages are found
 * (backwards compatible with seeds / test data).
 */

import { NextResponse } from 'next/server'
import { resolveCrmLead } from '../../../_auth'
import type { Lead } from '@/types/crm'

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, userId, lead } = resolved

  const body = await req.json() as {
    to_stage?: string
    note?: string
    pipeline?: 'main' | 'downgrade'
  }
  const { to_stage, note, pipeline = 'main' } = body

  if (!to_stage) {
    return NextResponse.json({ error: 'to_stage is required' }, { status: 400 })
  }

  // Fetch valid stages from DB for this creator + pipeline
  const { data: stageRows } = await admin
    .from('pipeline_stages')
    .select('name')
    .eq('creator_id', lead.creator_id)
    .eq('pipeline_type', pipeline)

  // If stages exist in DB, validate against them. If none (not yet seeded),
  // allow any value so existing data / tests aren't broken.
  if (stageRows && stageRows.length > 0) {
    const validNames = stageRows.map((r) => r.name as string)
    if (!validNames.includes(to_stage)) {
      return NextResponse.json(
        { error: `to_stage must be one of: ${validNames.join(', ')}` },
        { status: 400 },
      )
    }
  }

  if (pipeline === 'downgrade') {
    const { error: historyError } = await admin
      .from('lead_stage_history')
      .insert({
        lead_id:    lead.id,
        from_stage: lead.downgrade_stage ?? null,
        to_stage,
        changed_by: userId,
        note:       note ?? null,
      })

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 })
    }

    const { data: updated, error: updateError } = await admin
      .from('leads')
      .update({ downgrade_stage: to_stage })
      .eq('id', params.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? 'Stage update failed' }, { status: 500 })
    }

    return NextResponse.json(updated as Lead)
  }

  // ── Main pipeline ──────────────────────────────────────────────────────────

  const { error: historyError } = await admin
    .from('lead_stage_history')
    .insert({
      lead_id:    lead.id,
      from_stage: lead.stage,
      to_stage,
      changed_by: userId,
      note:       note ?? null,
    })

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 })
  }

  const { data: updated, error: updateError } = await admin
    .from('leads')
    .update({ stage: to_stage })
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Stage update failed' }, { status: 500 })
  }

  return NextResponse.json(updated as Lead)
}
