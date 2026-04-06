/**
 * PATCH  /api/crm/stages/[id]  — update a stage (name, color, position, is_won, is_lost)
 * DELETE /api/crm/stages/[id]  — delete a stage (blocked if leads exist in it)
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../../_auth'
import type { PipelineStage } from '@/types/crm'

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult

  if (role !== 'creator' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as Partial<{
    name: string
    color: string
    position: number
    is_won: boolean
    is_lost: boolean
  }>

  const updates: Record<string, unknown> = {}
  if (body.name     !== undefined) updates.name     = body.name.trim()
  if (body.color    !== undefined) updates.color    = body.color
  if (body.position !== undefined) updates.position = body.position
  if (body.is_won   !== undefined) updates.is_won   = body.is_won
  if (body.is_lost  !== undefined) updates.is_lost  = body.is_lost

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields provided' }, { status: 400 })
  }

  let query = admin.from('pipeline_stages').update(updates).eq('id', params.id)
  if (role !== 'super_admin') query = query.eq('creator_id', creatorId ?? '')

  const { data, error } = await query.select('*').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Stage not found or access denied' }, { status: 404 })
  }

  return NextResponse.json(data as PipelineStage)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult

  if (role !== 'creator' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch the stage to get its name and verify ownership
  let stageQuery = admin.from('pipeline_stages').select('*').eq('id', params.id)
  if (role !== 'super_admin') stageQuery = stageQuery.eq('creator_id', creatorId ?? '')

  const { data: stage } = await stageQuery.maybeSingle()

  if (!stage) {
    return NextResponse.json({ error: 'Stage not found or access denied' }, { status: 404 })
  }

  // Check whether any leads are currently in this stage
  const stageField = stage.pipeline_type === 'downgrade' ? 'downgrade_stage' : 'stage'
  const { count, error: countError } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', stage.creator_id)
    .eq(stageField, stage.name)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${count} lead${count !== 1 ? 's' : ''} are currently in this stage` },
      { status: 400 },
    )
  }

  const { error: deleteError } = await admin
    .from('pipeline_stages')
    .delete()
    .eq('id', params.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
