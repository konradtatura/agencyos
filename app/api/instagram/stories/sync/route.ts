/**
 * POST /api/instagram/stories/sync
 *
 * Triggers a story sync for the authenticated creator.
 * Stories sync is fast (≤ 20 active stories) so plain JSON is fine — no SSE.
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { syncStories } from '@/lib/instagram/sync-stories'

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const outcome = await syncStories(creatorId)

  if (!outcome.success) {
    return NextResponse.json({ error: outcome.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, synced_count: outcome.synced_count })
}
