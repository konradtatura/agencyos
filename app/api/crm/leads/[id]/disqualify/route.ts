/**
 * POST /api/crm/leads/[id]/disqualify — disqualify a lead with optional downgrade routing
 *
 * Body: { downgrade_offer: 'mt' | 'lt' | null }
 *
 * If downgrade_offer is 'mt' or 'lt':
 *   → pipeline_type = 'downgrade', offer_tier = downgrade_offer,
 *     downgrade_stage = 'offered', stage = 'disqualified'
 *
 * If downgrade_offer is null:
 *   → stage = 'dead'
 */

import { NextResponse } from 'next/server'
import { resolveCrmLead } from '../../../_auth'
import type { Lead, OfferTier } from '@/types/crm'

const DOWNGRADE_TIERS: OfferTier[] = ['mt', 'lt']

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, userId, lead } = resolved

  const body = await req.json() as { downgrade_offer?: 'mt' | 'lt' | null }

  // Validate — downgrade_offer key must be present in body
  if (!('downgrade_offer' in body)) {
    return NextResponse.json({ error: 'downgrade_offer is required (use null to mark dead)' }, { status: 400 })
  }

  const { downgrade_offer } = body

  if (downgrade_offer !== null && !DOWNGRADE_TIERS.includes(downgrade_offer as OfferTier)) {
    return NextResponse.json(
      { error: `downgrade_offer must be 'mt', 'lt', or null` },
      { status: 400 },
    )
  }

  const isDowngrade = downgrade_offer !== null
  const newStage = isDowngrade ? 'disqualified' : 'dead'

  const leadUpdates: Record<string, unknown> = { stage: newStage }

  if (isDowngrade) {
    leadUpdates.pipeline_type = 'downgrade'
    leadUpdates.offer_tier = downgrade_offer
    leadUpdates.downgrade_stage = 'offered'
  }

  // Log the stage change
  const { error: historyError } = await admin
    .from('lead_stage_history')
    .insert({
      lead_id: lead.id,
      from_stage: lead.stage,
      to_stage: newStage,
      changed_by: userId,
      note: isDowngrade
        ? `Disqualified — routed to ${downgrade_offer} downgrade pipeline`
        : 'Disqualified — no downgrade offer',
    })

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 })
  }

  // Update the lead
  const { data: updated, error: updateError } = await admin
    .from('leads')
    .update(leadUpdates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(updated as Lead)
}
