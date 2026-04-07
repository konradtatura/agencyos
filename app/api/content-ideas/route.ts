import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentIdeaInsert } from '@/lib/content-pipeline/types'

// ---------------------------------------------------------------------------
// GET /api/content-ideas
// ---------------------------------------------------------------------------
export async function GET() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('content_ideas')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// POST /api/content-ideas
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  let body: ContentIdeaInsert
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('content_ideas')
    .insert({
      creator_id:      creatorId,
      title:           body.title.trim(),
      platform:        body.platform ?? 'instagram',
      stage:           body.stage ?? 'idea',
      script:          body.script ?? null,
      inspiration_url: body.inspiration_url ?? null,
      additional_info: body.additional_info ?? null,
      stage_entered_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
