/**
 * GET  /api/crm/leads  — list leads for the authenticated user's workspace
 * POST /api/crm/leads  — create a new lead (creator / super_admin only)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCrmUser } from '../_auth'
import type { Lead, OfferTier, LeadSourceType, PipelineType } from '@/types/crm'

const VALID_OFFER_TIERS: OfferTier[] = ['ht', 'mt', 'lt']

const VALID_SOURCE_TYPES: LeadSourceType[] = ['story', 'reel', 'organic', 'manual', 'vsl_funnel']

const VALID_PIPELINE_TYPES: PipelineType[] = ['main', 'downgrade']

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, userId, role, creatorId } = authResult
  const { searchParams } = new URL(req.url)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = admin.from('leads').select('*') as any

  // Role-based base filter
  if (role === 'creator') {
    query = query.eq('creator_id', creatorId)
  } else if (role === 'setter') {
    query = query.eq('assigned_setter_id', userId)
  } else if (role === 'closer') {
    query = query.eq('assigned_closer_id', userId)
  }
  // super_admin: no base filter

  // Optional query param filters
  const stage = searchParams.get('stage')
  if (stage) query = query.eq('stage', stage)

  const pipeline_type = searchParams.get('pipeline_type')
  if (pipeline_type) query = query.eq('pipeline_type', pipeline_type)

  const offer_tier = searchParams.get('offer_tier')
  if (offer_tier) query = query.eq('offer_tier', offer_tier)

  const assigned_setter_id = searchParams.get('assigned_setter_id')
  if (assigned_setter_id) query = query.eq('assigned_setter_id', assigned_setter_id)

  const assigned_closer_id = searchParams.get('assigned_closer_id')
  if (assigned_closer_id) query = query.eq('assigned_closer_id', assigned_closer_id)

  const search = searchParams.get('search')
  if (search) {
    const term = `%${search}%`
    query = query.or(`name.ilike.${term},ig_handle.ilike.${term}`)
  }

  const dm_conversation_id = searchParams.get('dm_conversation_id')
  if (dm_conversation_id) query = query.eq('dm_conversation_id', dm_conversation_id)

  query = query.order('created_at', { ascending: false })

  const { data: leads, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(leads as Lead[])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult.error

  const { admin, userId, role, creatorId } = authResult

  // Only creator and super_admin can create leads
  if (role === 'setter' || role === 'closer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // super_admin must provide creator_id explicitly; creator uses their own
  let targetCreatorId = creatorId

  interface CreateLeadBody {
    name?: string
    ig_handle?: string
    email?: string
    phone?: string
    offer_tier?: string
    assigned_setter_id?: string
    assigned_closer_id?: string
    pipeline_type?: string
    lead_source_type?: string
    creator_id?: string  // super_admin only
  }

  const body = await req.json() as CreateLeadBody

  if (role === 'super_admin') {
    if (!body.creator_id) {
      return NextResponse.json({ error: 'creator_id is required for super_admin' }, { status: 400 })
    }
    targetCreatorId = body.creator_id
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  if (body.offer_tier && !VALID_OFFER_TIERS.includes(body.offer_tier as OfferTier)) {
    return NextResponse.json(
      { error: `offer_tier must be one of: ${VALID_OFFER_TIERS.join(', ')}` },
      { status: 400 },
    )
  }

  if (body.pipeline_type && !VALID_PIPELINE_TYPES.includes(body.pipeline_type as PipelineType)) {
    return NextResponse.json(
      { error: `pipeline_type must be one of: ${VALID_PIPELINE_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  if (body.lead_source_type && !VALID_SOURCE_TYPES.includes(body.lead_source_type as LeadSourceType)) {
    return NextResponse.json(
      { error: `lead_source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  // Insert lead
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .insert({
      creator_id: targetCreatorId,
      name: body.name.trim(),
      ig_handle: body.ig_handle ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      offer_tier: body.offer_tier ?? null,
      assigned_setter_id: body.assigned_setter_id ?? null,
      assigned_closer_id: body.assigned_closer_id ?? null,
      pipeline_type: body.pipeline_type ?? 'main',
      lead_source_type: body.lead_source_type ?? null,
      stage: 'dmd',
    })
    .select('*')
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? 'Failed to create lead' }, { status: 500 })
  }

  // Log initial stage in history
  await admin.from('lead_stage_history').insert({
    lead_id: lead.id,
    from_stage: null,
    to_stage: 'dmd',
    changed_by: userId,
  })

  return NextResponse.json(lead as Lead, { status: 201 })
}
