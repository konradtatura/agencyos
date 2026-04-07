/**
 * POST /api/instagram/transcribe
 *
 * Body: { postId: string }
 *
 * Synchronously transcribes a reel using OpenAI Whisper.
 * Long videos can take 30–60 s — the route awaits completion before responding.
 *
 * Flow:
 *  1. Auth — verify caller is a logged-in creator
 *  2. Fetch post, verify it belongs to the creator
 *  3. Guard — must be VIDEO with a media_url
 *  4. Set transcript_status = "processing" immediately (visible to polling)
 *  5. Call transcribeReel → writes post_transcripts row, sets status = "done"
 *  6. Return { success: true, transcript } or { success: false, error }
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'
import { transcribeReel } from '@/lib/transcription/whisper'
import { TRANSCRIPTION_DAILY_LIMIT } from '@/lib/instagram/transcription-limits'

export async function POST(request: Request) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { admin, creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { postId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { postId } = body
  if (typeof postId !== 'string' || !postId) {
    return NextResponse.json({ error: 'postId must be a non-empty string' }, { status: 400 })
  }

  // ── 2. Fetch post ───────────────────────────────────────────────────────────
  const { data: post } = await admin
    .from('instagram_posts')
    .select('id, media_type, media_url, transcript_status')
    .eq('id', postId)
    .eq('creator_id', creatorId)   // ownership check
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // ── 3. Guards ───────────────────────────────────────────────────────────────

  // Daily usage check
  const today = new Date().toISOString().split('T')[0]
  const { data: usageRow } = await admin
    .from('transcription_usage')
    .select('id, count')
    .eq('creator_id', creatorId)
    .eq('date', today)
    .maybeSingle()

  const todayCount = usageRow?.count ?? 0
  if (todayCount >= TRANSCRIPTION_DAILY_LIMIT) {
    return NextResponse.json(
      { error: 'Daily limit reached', count: todayCount, limit: TRANSCRIPTION_DAILY_LIMIT },
      { status: 429 },
    )
  }

  if (post.media_type !== 'VIDEO') {
    return NextResponse.json({ error: 'Only VIDEO posts can be transcribed' }, { status: 400 })
  }

  if (!post.media_url) {
    return NextResponse.json({ error: 'Post has no media_url — sync the post first' }, { status: 400 })
  }

  if (post.transcript_status === 'processing') {
    return NextResponse.json({ error: 'Transcription already in progress' }, { status: 409 })
  }

  if (post.transcript_status === 'done') {
    return NextResponse.json({ error: 'Post already has a transcript' }, { status: 409 })
  }

  // ── 4. Mark processing immediately (visible to GET /status polls) ───────────
  await admin
    .from('instagram_posts')
    .update({ transcript_status: 'processing' })
    .eq('id', post.id)

  // ── 5. Run Whisper (synchronous — ~30–60 s for longer reels) ────────────────
  const result = await transcribeReel(post.id, post.media_url)

  // ── 6. Respond ──────────────────────────────────────────────────────────────
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 })
  }

  // ── 7. Increment daily usage on success ─────────────────────────────────────
  if (usageRow) {
    await admin
      .from('transcription_usage')
      .update({ count: todayCount + 1 })
      .eq('id', usageRow.id)
  } else {
    await admin
      .from('transcription_usage')
      .insert({ creator_id: creatorId, date: today, count: 1 })
  }

  return NextResponse.json({ success: true, transcript: result.transcript })
}
