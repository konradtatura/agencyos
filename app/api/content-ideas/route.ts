import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentIdeaInsert } from '@/lib/content-pipeline/types'

// ---------------------------------------------------------------------------
// Auth helper — resolves the caller's creator_id
// ---------------------------------------------------------------------------
async function resolveCreatorId(): Promise<
  { creatorId: string; admin: ReturnType<typeof createAdminClient> } | { error: NextResponse }
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

  // Super admins can access everything — skip creator check
  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userRow?.role === 'super_admin') {
    // For super_admin we still need a creator_id to scope queries; skip creator
    // requirement and let the caller handle it
    return { error: NextResponse.json({ error: 'Super admins must use admin API' }, { status: 403 }) }
  }

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return { error: NextResponse.json({ error: 'Creator profile not found' }, { status: 404 }) }
  }

  return { creatorId: profile.id as string, admin }
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
