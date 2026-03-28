/**
 * GET /api/instagram/transcribe/status?postId=xxx
 *
 * Returns the current transcript_status and transcript text (if done).
 *
 * Response:
 *   { status: 'none' | 'processing' | 'done', transcript: string | null }
 *
 * Useful for polling while a long transcription is in flight.
 * Also scoped to the authenticated creator — cannot probe other creators' posts.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse query param ────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('postId')

  if (!postId) {
    return NextResponse.json({ error: 'postId query param is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Resolve creator ──────────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // ── Fetch post status — ownership-scoped ─────────────────────────────────────
  const { data: post } = await admin
    .from('instagram_posts')
    .select('id, transcript_status')
    .eq('id', postId)
    .eq('creator_id', profile.id)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // ── If done, fetch the transcript text ───────────────────────────────────────
  let transcriptText: string | null = null

  if (post.transcript_status === 'done') {
    const { data: row } = await admin
      .from('post_transcripts')
      .select('transcript_text')
      .eq('post_id', postId)
      .single()

    transcriptText = row?.transcript_text ?? null
  }

  return NextResponse.json({
    status:     post.transcript_status,
    transcript: transcriptText,
  })
}
