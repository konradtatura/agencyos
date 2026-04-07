/**
 * POST /api/instagram/posts/trial
 *
 * Sets is_trial on one or more instagram_posts rows.
 * Body: { post_ids: string[], is_trial: boolean }
 *
 * Only updates posts that belong to the authenticated creator.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

export async function POST(request: Request) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { admin, creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })

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

  // Update — the WHERE on creator_id ensures creators can only touch their own posts
  const { error } = await admin
    .from('instagram_posts')
    .update({ is_trial })
    .in('id', post_ids as string[])
    .eq('creator_id', creatorId)

  if (error) {
    console.error('[trial] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: (post_ids as string[]).length })
}
