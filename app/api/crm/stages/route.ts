/**
 * GET   /api/crm/stages?pipeline_type=main  — ordered stages for the current creator
 * POST  /api/crm/stages                     — create a new stage
 * PATCH /api/crm/stages                     — bulk reorder { stages: [{id, position}] }
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../_auth'
import type { PipelineStage } from '@/types/crm'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult
  const { searchParams } = new URL(req.url)
  const pipelineType = searchParams.get('pipeline_type') ?? 'main'

  // Determine which creator's stages to return
  let targetCreatorId = creatorId
  if (role === 'super_admin') {
    targetCreatorId = searchParams.get('creator_id') ?? null
  }
  if (!targetCreatorId) {
    return NextResponse.json([])
  }

  const { data, error } = await admin
    .from('pipeline_stages')
    .select('*')
    .eq('creator_id', targetCreatorId)
    .eq('pipeline_type', pipelineType)
    .order('position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json((data ?? []) as PipelineStage[])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult

  if (role !== 'creator' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let targetCreatorId = creatorId
  const body = await req.json() as {
    name?: string
    color?: string
    pipeline_type?: string
    position?: number
    creator_id?: string
  }

  if (role === 'super_admin') {
    if (!body.creator_id) {
      return NextResponse.json({ error: 'creator_id required for super_admin' }, { status: 400 })
    }
    targetCreatorId = body.creator_id
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const pipelineType = body.pipeline_type ?? 'main'
  if (!['main', 'downgrade'].includes(pipelineType)) {
    return NextResponse.json({ error: 'pipeline_type must be main or downgrade' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('pipeline_stages')
    .insert({
      creator_id:    targetCreatorId,
      pipeline_type: pipelineType,
      name:          body.name.trim(),
      color:         body.color ?? '#6b7280',
      position:      body.position ?? 999,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A stage with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as PipelineStage, { status: 201 })
}

// ── PATCH (bulk reorder) ──────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult

  if (role !== 'creator' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { stages?: Array<{ id: string; position: number }> }

  if (!Array.isArray(body.stages) || body.stages.length === 0) {
    return NextResponse.json({ error: 'stages array is required' }, { status: 400 })
  }

  const updateOps = body.stages.map(({ id, position }) => {
    let q = admin.from('pipeline_stages').update({ position }).eq('id', id)
    if (role !== 'super_admin') q = q.eq('creator_id', creatorId ?? '')
    return q
  })

  await Promise.all(updateOps)

  return NextResponse.json({ success: true })
}
