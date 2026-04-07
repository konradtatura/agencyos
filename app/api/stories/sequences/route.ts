/**
 * POST /api/stories/sequences
 *
 * Creates a new story sequence and, optionally, its initial set of slides
 * in a single request. Slides are inserted in bulk after the sequence row
 * is created; if that bulk insert fails the sequence is deleted to avoid
 * orphaned rows (manual rollback — no DB transaction available via REST).
 *
 * Body:
 *   {
 *     name:     string                           // non-empty display name
 *     cta_type: 'dm' | 'link' | 'poll' | 'reply'
 *     slides:   Array<{
 *       story_id:    string
 *       slide_order: number
 *       is_cta_slide: boolean
 *     }>
 *   }
 *
 * Returns: { success: true, id: string }
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_CTA_TYPES = ['dm', 'link', 'poll', 'reply', 'none'] as const
type CtaType = typeof VALID_CTA_TYPES[number]

interface SlideInput {
  story_id:     string
  slide_order:  number
  is_cta_slide: boolean
}

export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  // ── Parse & validate body ─────────────────────────────────────────────────────
  const body = await req.json() as { name?: string; cta_type?: string; slides?: SlideInput[] }
  const { name, cta_type, slides = [] } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
  }

  if (!cta_type || !VALID_CTA_TYPES.includes(cta_type as CtaType)) {
    return NextResponse.json(
      { error: `cta_type must be one of: ${VALID_CTA_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  // ── Insert sequence ───────────────────────────────────────────────────────────
  const { data: seq, error: seqError } = await admin
    .from('story_sequences')
    .insert({ creator_id: creatorId, name: name.trim(), cta_type })
    .select('id')
    .single()

  if (seqError || !seq) {
    return NextResponse.json({ error: seqError?.message ?? 'Failed to create sequence' }, { status: 500 })
  }

  // ── Insert slides (if provided) ───────────────────────────────────────────────
  if (slides.length > 0) {
    const slideRows = slides.map((s) => ({
      sequence_id:  seq.id,
      story_id:     s.story_id,
      slide_order:  s.slide_order,
      is_cta_slide: s.is_cta_slide,
    }))

    const { error: slidesError } = await admin
      .from('story_sequence_slides')
      .insert(slideRows)

    if (slidesError) {
      // Manual rollback — delete the orphaned sequence row
      await admin.from('story_sequences').delete().eq('id', seq.id)
      return NextResponse.json({ error: 'Failed to insert slides; sequence rolled back' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, id: seq.id })
}
