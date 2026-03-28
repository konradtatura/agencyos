/**
 * POST /api/crm/leads/[id]/stage — move a lead to a new stage
 *
 * Body: { to_stage: string, note?: string, pipeline?: 'main' | 'downgrade' }
 *
 * pipeline='downgrade': validates to_stage against downgrade stages, updates
 *   leads.downgrade_stage (not leads.stage), and logs in lead_stage_history.
 * pipeline='main' (default): validates against the 11-value main stage enum,
 *   updates leads.stage, and logs history.
 *
 * If to_stage = 'disqualified' on the main pipeline, the stage is updated and
 * logged — the /disqualify endpoint handles the full routing flow.
 */

import { NextResponse } from 'next/server'
import { resolveCrmLead } from '../../../_auth'
import type { Lead, LeadStage, DowngradeStage } from '@/types/crm'

const MAIN_VALID_STAGES: LeadStage[] = [
  'dmd', 'qualifying', 'qualified', 'call_booked', 'showed',
  'closed_won', 'closed_lost', 'follow_up', 'nurture', 'disqualified', 'dead',
]

const DOWNGRADE_VALID_STAGES: DowngradeStage[] = [
  'offered', 'interested', 'booked', 'closed', 'dead',
]

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

  if (pipeline === 'downgrade') {
    if (!to_stage || !DOWNGRADE_VALID_STAGES.includes(to_stage as DowngradeStage)) {
      return NextResponse.json(
        { error: `to_stage must be one of: ${DOWNGRADE_VALID_STAGES.join(', ')}` },
        { status: 400 },
      )
    }

    // Log history using current downgrade_stage as from_stage
    const { error: historyError } = await admin
      .from('lead_stage_history')
      .insert({
        lead_id: lead.id,
        from_stage: lead.downgrade_stage ?? null,
        to_stage,
        changed_by: userId,
        note: note ?? null,
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
  if (!to_stage || !MAIN_VALID_STAGES.includes(to_stage as LeadStage)) {
    return NextResponse.json(
      { error: `to_stage must be one of: ${MAIN_VALID_STAGES.join(', ')}` },
      { status: 400 },
    )
  }

  const { error: historyError } = await admin
    .from('lead_stage_history')
    .insert({
      lead_id: lead.id,
      from_stage: lead.stage,
      to_stage,
      changed_by: userId,
      note: note ?? null,
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
