/**
 * PATCH /api/instagram/posts/manual-metrics
 *
 * Saves a single manually entered metric for a post.
 * Updates the most recent instagram_post_metrics row for the post,
 * or creates one if none exists.
 *
 * Body: { post_id: string, field: ManualMetricField, value: number }
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export type ManualMetricField = 'avg_watch_time_ms'

const ALLOWED_FIELDS: ManualMetricField[] = ['avg_watch_time_ms']

export async function PATCH(req: Request) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const body = await req.json() as { post_id?: string; field?: string; value?: unknown }
  const { post_id, field, value } = body

  if (!post_id || !field || !ALLOWED_FIELDS.includes(field as ManualMetricField)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (typeof value !== 'number' || !isFinite(value) || value < 0) {
    return NextResponse.json({ error: 'value must be a non-negative finite number' }, { status: 400 })
  }

  const { data: post } = await admin
    .from('instagram_posts')
    .select('id')
    .eq('id', post_id)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // Find the latest metrics row for this post
  const { data: latestRow } = await admin
    .from('instagram_post_metrics')
    .select('id, synced_date')
    .eq('post_id', post_id)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const manualFlag = `${field}_manual` as const

  if (latestRow) {
    // Update the existing latest row
    const { error } = await admin
      .from('instagram_post_metrics')
      .update({ [field]: value, [manualFlag]: true })
      .eq('id', latestRow.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // No metrics row yet — create one with today's date
    const now       = new Date().toISOString()
    const today     = now.split('T')[0]
    const { error } = await admin
      .from('instagram_post_metrics')
      .insert({
        post_id,
        synced_at:   now,
        synced_date: today,
        [field]:     value,
        [manualFlag]: true,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
