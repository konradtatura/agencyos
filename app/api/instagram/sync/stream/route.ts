/**
 * POST /api/instagram/sync/stream
 *
 * Runs a full sync (account stats → posts + insights) and streams progress
 * as Server-Sent Events so the client can update its UI in real time.
 *
 * Event shapes:
 *   { phase: 'account', message: string }
 *   { phase: 'posts',   message: string, fetched: number, total: number }
 *   { phase: 'stories', message: string }
 *   { phase: 'done',    message: string, post_count: number, story_count: number, last_sync: string }
 *   { phase: 'error',   message: string }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncAccountStats } from '@/lib/instagram/sync'
import { syncPosts } from '@/lib/instagram/sync-posts'
import { syncStories } from '@/lib/instagram/sync-stories'

export async function POST() {
  // ── Auth & profile ────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // ── SSE stream ────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Phase 1 — account stats
        send({ phase: 'account', message: 'Syncing account stats…' })
        await syncAccountStats(profile.id)

        // Phase 2 — posts + per-post insights
        send({ phase: 'posts', message: 'Syncing posts…', fetched: 0, total: 0 })

        const { postCount } = await syncPosts(profile.id, (fetched, total) => {
          send({ phase: 'posts', message: 'Syncing posts…', fetched, total })
        })

        // Phase 3 — stories
        send({ phase: 'stories', message: 'Syncing stories…' })
        const storiesOutcome = await syncStories(profile.id)
        const storyCount = storiesOutcome.success ? storiesOutcome.synced_count : 0

        // Done
        send({
          phase:       'done',
          message:     `Sync complete`,
          post_count:  postCount,
          story_count: storyCount,
          last_sync:   new Date().toISOString(),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        send({ phase: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
