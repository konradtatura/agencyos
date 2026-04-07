/**
 * GET  /api/stories/sequences/[id]  — fetch sequence + enriched slides
 * PUT  /api/stories/sequences/[id]  — update name and/or cta_type
 * DELETE /api/stories/sequences/[id] — delete sequence (slides cascade via FK)
 *
 * All handlers authenticate the caller and confirm the sequence belongs to
 * their creator profile before performing any operation.
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_CTA_TYPES = ['dm', 'link', 'poll', 'reply', 'none'] as const

// ── Shared: auth + creator resolution + ownership check ──────────────────────

async function resolveCreatorAndVerifySequence(sequenceId: string) {
  const creatorId = await getCreatorId()
  if (!creatorId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()

  // Confirm the sequence belongs to this creator
  const { data: seq } = await admin
    .from('story_sequences')
    .select('id')
    .eq('id', sequenceId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!seq) {
    return { error: NextResponse.json({ error: 'Sequence not found' }, { status: 404 }) }
  }

  return { admin, creatorId }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCreatorAndVerifySequence(params.id)
  if ('error' in resolved) return resolved.error

  const { admin } = resolved

  // Fetch the sequence header
  const { data: sequence, error: seqError } = await admin
    .from('story_sequences')
    .select('id, name, cta_type, correlated_dm_count, created_at')
    .eq('id', params.id)
    .single()

  if (seqError || !sequence) {
    return NextResponse.json({ error: 'Failed to fetch sequence' }, { status: 500 })
  }

  // Fetch all slides for this sequence, ordered for display
  const { data: slides, error: slidesError } = await admin
    .from('story_sequence_slides')
    .select('id, slide_order, is_cta_slide, story_id')
    .eq('sequence_id', params.id)
    .order('slide_order', { ascending: true })

  if (slidesError) {
    return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 })
  }

  const slideRows = slides ?? []

  // Collect unique story IDs so we can fetch story metadata in one query
  const storyIdSet = new Set(slideRows.map((s) => s.story_id))
  const storyIds   = Array.from(storyIdSet)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storyMap = new Map<string, any>()

  if (storyIds.length > 0) {
    const { data: stories, error: storiesError } = await admin
      .from('instagram_stories')
      .select(
        'id, thumbnail_url, media_url, media_type, posted_at, ' +
        'impressions, reach, taps_forward, taps_back, exits, ' +
        'replies, link_clicks, exit_rate',
      )
      .in('id', storyIds)

    if (storiesError) {
      return NextResponse.json({ error: 'Failed to fetch story data' }, { status: 500 })
    }

    // exit_rate is numeric(6,3) — PostgREST returns it as a string; leave it
    // as-is and let the client parse / format it as needed.
    // Cast through unknown to shed the GenericStringError inference from the
    // untyped Supabase client — safe because we checked storiesError above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storyMap = new Map(((stories ?? []) as unknown as any[]).map((s) => [s.id as string, s]))
  }

  // Enrich each slide with its corresponding story object
  const enrichedSlides = slideRows.map((slide) => ({
    ...slide,
    story: storyMap.get(slide.story_id) ?? null,
  }))

  return NextResponse.json({ ...sequence, slides: enrichedSlides })
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCreatorAndVerifySequence(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, creatorId } = resolved

  const body = await req.json() as { name?: string; cta_type?: string }
  const { name, cta_type } = body

  // Build only the fields the caller actually provided
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    updates.name = name.trim()
  }

  if (cta_type !== undefined) {
    if (!VALID_CTA_TYPES.includes(cta_type as typeof VALID_CTA_TYPES[number])) {
      return NextResponse.json(
        { error: `cta_type must be one of: ${VALID_CTA_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
    updates.cta_type = cta_type
  }

  const { error: updateError } = await admin
    .from('story_sequences')
    .update(updates)
    .eq('id', params.id)
    .eq('creator_id', creatorId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveCreatorAndVerifySequence(params.id)
  if ('error' in resolved) return resolved.error

  const { admin, creatorId } = resolved

  // story_sequence_slides rows are removed automatically via the FK cascade.
  const { error: deleteError } = await admin
    .from('story_sequences')
    .delete()
    .eq('id', params.id)
    .eq('creator_id', creatorId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
