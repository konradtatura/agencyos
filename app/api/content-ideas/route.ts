import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'
import type { ContentIdeaInsert } from '@/lib/content-pipeline/types'

// ---------------------------------------------------------------------------
// Auth helper — resolves the caller's creator_id (supports impersonation)
// ---------------------------------------------------------------------------
async function resolveCreatorId(): Promise<
  { creatorId: string; admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient> } | { error: NextResponse }
> {
  const auth = await resolveCrmUser()
  if ('error' in auth) return { error: auth.error }
  const { admin, creatorId } = auth
  if (!creatorId) return { error: NextResponse.json({ error: 'Creator profile not found' }, { status: 404 }) }
  return { creatorId, admin }
}

// ---------------------------------------------------------------------------
// GET /api/content-ideas
// ---------------------------------------------------------------------------
export async function GET() {
  const result = await resolveCreatorId()
  if ('error' in result) return result.error

  const { creatorId, admin } = result

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
  const result = await resolveCreatorId()
  if ('error' in result) return result.error

  const { creatorId, admin } = result

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
