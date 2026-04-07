import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'
import { triggerFullSync } from '@/lib/instagram/sync'

// ── POST /api/instagram/sync ──────────────────────────────────────────────────

export async function POST() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })

  const result = await triggerFullSync(creatorId)
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

// ── GET /api/instagram/sync/status ── (kept in same file via Next.js route segment)
// Status is served from /api/instagram/sync/status — see status/route.ts
