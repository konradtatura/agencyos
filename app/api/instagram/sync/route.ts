import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { triggerFullSync } from '@/lib/instagram/sync'

// ── POST /api/instagram/sync ──────────────────────────────────────────────────

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await triggerFullSync(creatorId)
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

// ── GET /api/instagram/sync/status ── (kept in same file via Next.js route segment)
// Status is served from /api/instagram/sync/status — see status/route.ts
