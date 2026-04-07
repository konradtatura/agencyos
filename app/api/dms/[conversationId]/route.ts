/**
 * PATCH /api/dms/[conversationId]
 *
 * Update a conversation's status or assigned_setter_id.
 * Transitioning to 'qualified' or 'booked' auto-upserts a CRM lead.
 */

import { NextResponse } from 'next/server'
import { resolveDmConversation } from '../_auth'

const VALID_STATUSES = [
  'new', 'qualifying', 'qualified', 'disqualified',
  'booked', 'no_show', 'closed_won', 'closed_lost',
  'follow_up', 'nurture',
] as const

type ConversationStatus = typeof VALID_STATUSES[number]

// Status → lead stage mapping for auto-upsert
const LEAD_STAGE_MAP: Partial<Record<ConversationStatus, string>> = {
  qualified: 'qualifying',
  booked:    'call_booked',
}

export async function PATCH(
  req: Request,
  { params }: { params: { conversationId: string } },
) {
  const resolved = await resolveDmConversation(params.conversationId)
  if ('error' in resolved) return resolved.error

  const { admin, userId, conversation } = resolved

  let body: { status?: string; assigned_setter_id?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if ('status' in body) {
    if (!VALID_STATUSES.includes(body.status as ConversationStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }
    updates.status = body.status
  }

  if ('assigned_setter_id' in body) {
    updates.assigned_setter_id = body.assigned_setter_id ?? null
  }

  if ('unread_count' in body && body.unread_count === 0) {
    updates.unread_count = 0
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No patchable fields provided' }, { status: 400 })
  }

  // Apply the conversation update
  const { data: updated, error: updateError } = await admin
    .from('dm_conversations')
    .update(updates)
    .eq('id', conversation.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('[dm-patch] failed to update conversation:', updateError)
    return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
  }

  // ── Auto-upsert CRM lead when status crosses into qualified / booked ─────────
  const newStatus = updates.status as ConversationStatus | undefined
  const leadStage = newStatus ? LEAD_STAGE_MAP[newStatus] : undefined

  if (leadStage) {
    await upsertLeadFromConversation({
      admin,
      conversation: updated,
      leadStage,
      changedBy: userId,
    })
  }

  return NextResponse.json(updated)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertLeadFromConversation({
  admin,
  conversation,
  leadStage,
  changedBy,
}: {
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
  conversation: Record<string, unknown>
  leadStage: string
  changedBy: string
}) {
  const convId    = conversation.id as string
  const creatorId = conversation.creator_id as string
  const igHandle  = (conversation.ig_username as string | null) ?? (conversation.ig_user_id as string)

  // Check if a lead for this conversation already exists
  const { data: existing } = await admin
    .from('leads')
    .select('id, stage')
    .eq('dm_conversation_id', convId)
    .maybeSingle()

  if (existing) {
    // Only advance the stage — never regress
    const stageOrder = [
      'dmd', 'qualifying', 'qualified', 'call_booked', 'showed',
      'closed_won', 'closed_lost', 'follow_up', 'nurture', 'disqualified', 'dead',
    ]
    const currentIdx = stageOrder.indexOf(existing.stage)
    const newIdx     = stageOrder.indexOf(leadStage)

    if (newIdx <= currentIdx) {
      console.log(`[dm-patch] lead ${existing.id} already at stage "${existing.stage}", skipping regression to "${leadStage}"`)
      return
    }

    const { error } = await admin
      .from('leads')
      .update({ stage: leadStage, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) {
      console.error('[dm-patch] failed to update existing lead stage:', error)
      return
    }

    await admin.from('lead_stage_history').insert({
      lead_id:    existing.id,
      from_stage: existing.stage,
      to_stage:   leadStage,
      changed_by: changedBy,
      note:       'Stage updated via DM inbox',
    })

    console.log(`[dm-patch] lead ${existing.id} advanced → ${leadStage}`)
    return
  }

  // Create a new lead
  const { data: newLead, error: insertError } = await admin
    .from('leads')
    .insert({
      creator_id:          creatorId,
      name:                igHandle,
      ig_handle:           igHandle,
      stage:               leadStage,
      pipeline_type:       'main',
      lead_source_type:    'organic',
      dm_conversation_id:  convId,
    })
    .select('id')
    .single()

  if (insertError || !newLead) {
    console.error('[dm-patch] failed to create lead from conversation:', insertError)
    return
  }

  await admin.from('lead_stage_history').insert({
    lead_id:    newLead.id,
    from_stage: null,
    to_stage:   leadStage,
    changed_by: changedBy,
    note:       'Lead created from DM inbox',
  })

  console.log(`[dm-patch] created lead ${newLead.id} → ${leadStage} from conversation ${convId}`)
}
