import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentIdeaUpdate } from '@/lib/content-pipeline/types'

// ---------------------------------------------------------------------------
// Auth helper — resolves the caller's creator_id and verifies idea ownership
// ---------------------------------------------------------------------------
async function resolveIdeaAccess(ideaId: string): Promise<
  | { admin: ReturnType<typeof createAdminClient>; creatorId: string }
  | { error: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return { error: NextResponse.json({ error: 'Creator profile not found' }, { status: 404 }) }
  }

  const creatorId = profile.id as string

  // Verify the idea belongs to this creator
  const { data: idea } = await admin
    .from('content_ideas')
    .select('id, creator_id')
    .eq('id', ideaId)
    .maybeSingle()

  if (!idea) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }

  if (idea.creator_id !== creatorId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, creatorId }
}

// ---------------------------------------------------------------------------
// PATCH /api/content-ideas/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await resolveIdeaAccess(id)
  if ('error' in result) return result.error

  const { admin } = result

  let body: ContentIdeaUpdate
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // If the stage is being changed, reset stage_entered_at
  const update: ContentIdeaUpdate = { ...body }
  if (body.stage && !body.stage_entered_at) {
    update.stage_entered_at = new Date().toISOString()
  }

  const { data, error } = await admin
    .from('content_ideas')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// DELETE /api/content-ideas/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await resolveIdeaAccess(id)
  if ('error' in result) return result.error

  const { admin } = result

  const { error } = await admin
    .from('content_ideas')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
