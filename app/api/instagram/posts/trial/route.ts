/**
 * POST /api/instagram/posts/trial
 *
 * Sets is_trial on one or more instagram_posts rows.
 * Body: { post_ids: string[], is_trial: boolean }
 *
 * Only updates posts that belong to the authenticated creator.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { post_ids?: unknown; is_trial?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { post_ids, is_trial } = body

  if (!Array.isArray(post_ids) || post_ids.length === 0) {
    return NextResponse.json({ error: 'post_ids must be a non-empty array' }, { status: 400 })
  }
  if (typeof is_trial !== 'boolean') {
    return NextResponse.json({ error: 'is_trial must be a boolean' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Resolve creator profile
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // Update — the WHERE on creator_id ensures creators can only touch their own posts
  const { error } = await admin
    .from('instagram_posts')
    .update({ is_trial })
    .in('id', post_ids as string[])
    .eq('creator_id', profile.id)

  if (error) {
    console.error('[trial] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: (post_ids as string[]).length })
}
