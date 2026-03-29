/**
 * POST /api/crm/leads/[id]/outcome — record a call outcome for a booked lead
 *
 * Body variants:
 *   { outcome: 'no_show',     notes?: string }
 *   { outcome: 'showed_lost', reason: string, notes?: string }
 *   { outcome: 'showed_won',  product_id?: string, product_name?: string,
 *                              amount: number, payment_type: 'upfront'|'instalment'|'recurring',
 *                              notes?: string }
 *
 * On showed_won: creates a sale record and logs two stage history entries
 *   (call_booked → showed → closed_won).
 * On showed_lost: logs two history entries (call_booked → showed → closed_lost).
 * On no_show: logs one history entry (call_booked → no_show).
 *
 * GHL stage push is console.logged — real API call added in Sprint 11.
 */

import { NextResponse } from 'next/server'
import { resolveCrmLead } from '../../../_auth'
import { pushStageToGHL } from '@/lib/ghl-sync'

type NoShowBody = {
  outcome: 'no_show'
  notes?: string
}

type ShowedLostBody = {
  outcome: 'showed_lost'
  reason: string
  notes?: string
}

type ShowedWonBody = {
  outcome: 'showed_won'
  product_id?: string
  product_name?: string
  amount: number
  payment_type: 'upfront' | 'instalment' | 'recurring'
  notes?: string
}

type OutcomeBody = NoShowBody | ShowedLostBody | ShowedWonBody

const LOST_REASONS = [
  'price_objection',
  'not_a_fit',
  'needs_time',
  'ghosted',
  'other',
] as const

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCrmLead(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, userId, lead } = resolved

  if (lead.stage !== 'call_booked') {
    return NextResponse.json(
      { error: `Lead must be in 'call_booked' stage to record an outcome (current: ${lead.stage})` },
      { status: 400 },
    )
  }

  const body = (await req.json()) as OutcomeBody

  // ── No Show ────────────────────────────────────────────────────────────────
  if (body.outcome === 'no_show') {
    const { error: histErr } = await admin.from('lead_stage_history').insert({
      lead_id: lead.id,
      from_stage: 'call_booked',
      to_stage: 'no_show',
      changed_by: userId,
      note: body.notes ?? null,
    })
    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 })

    const { data: updated, error: updateErr } = await admin
      .from('leads')
      .update({ stage: 'no_show', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
      .select('*')
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    void pushStageToGHL(lead.id, 'no_show')

    return NextResponse.json(updated)
  }

  // ── Showed → Lost ──────────────────────────────────────────────────────────
  if (body.outcome === 'showed_lost') {
    if (!body.reason || !LOST_REASONS.includes(body.reason as typeof LOST_REASONS[number])) {
      return NextResponse.json(
        { error: `reason must be one of: ${LOST_REASONS.join(', ')}` },
        { status: 400 },
      )
    }

    // Two history entries: call_booked → showed → closed_lost
    const { error: histErr } = await admin.from('lead_stage_history').insert([
      {
        lead_id: lead.id,
        from_stage: 'call_booked',
        to_stage: 'showed',
        changed_by: userId,
        note: 'Prospect showed for call',
      },
      {
        lead_id: lead.id,
        from_stage: 'showed',
        to_stage: 'closed_lost',
        changed_by: userId,
        note: body.notes ? `${body.reason} — ${body.notes}` : body.reason,
      },
    ])
    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 })

    const { data: updated, error: updateErr } = await admin
      .from('leads')
      .update({ stage: 'closed_lost', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
      .select('*')
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    void pushStageToGHL(lead.id, 'closed_lost')

    return NextResponse.json(updated)
  }

  // ── Showed → Won ───────────────────────────────────────────────────────────
  if (body.outcome === 'showed_won') {
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    if (!['upfront', 'instalment', 'recurring'].includes(body.payment_type)) {
      return NextResponse.json({ error: 'invalid payment_type' }, { status: 400 })
    }

    // Two history entries: call_booked → showed → closed_won
    const { error: histErr } = await admin.from('lead_stage_history').insert([
      {
        lead_id: lead.id,
        from_stage: 'call_booked',
        to_stage: 'showed',
        changed_by: userId,
        note: 'Prospect showed for call',
      },
      {
        lead_id: lead.id,
        from_stage: 'showed',
        to_stage: 'closed_won',
        changed_by: userId,
        note: body.notes ?? null,
      },
    ])
    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 })

    // Update lead stage + deal value
    const { data: updated, error: updateErr } = await admin
      .from('leads')
      .update({
        stage: 'closed_won',
        deal_value: body.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)
      .select('*')
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Create sale record
    const { error: saleErr } = await admin.from('sales').insert({
      creator_id: lead.creator_id,
      lead_id: lead.id,
      product_id: body.product_id ?? null,
      product_name: body.product_name ?? null,
      amount: body.amount,
      platform: 'manual',
      payment_type: body.payment_type,
      sale_date: new Date().toISOString().split('T')[0],
      closer_id: userId,
      lead_source_type: lead.lead_source_type ?? null,
      lead_source_id: lead.lead_source_id ?? null,
      notes: body.notes ?? null,
    })
    if (saleErr) {
      console.error('[outcome] sale insert failed:', saleErr.message)
      // Non-fatal: stage already updated — log but continue
    }

    void pushStageToGHL(lead.id, 'closed_won')

    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Invalid outcome value' }, { status: 400 })
}
