import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triggerFullSync } from '@/lib/instagram/sync'

/**
 * POST /api/internal/instagram/sync-all
 *
 * Internal endpoint called by the Supabase Edge Function cron job.
 * Protected by the CRON_SECRET env var — not exposed to regular users.
 */
export async function POST(req: NextRequest) {
  // ── Auth: require CRON_SECRET header ────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[sync-all] CRON_SECRET env var is not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const authHeader = req.headers.get('x-cron-secret')
  if (authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Find all creators with an active Instagram integration ───────────────
  const admin = createAdminClient()

  const { data: integrations, error } = await admin
    .from('integrations')
    .select('creator_id')
    .eq('platform', 'instagram')
    .eq('status', 'active')

  if (error) {
    console.error('[sync-all] Failed to query integrations:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const creatorIds = (integrations ?? []).map((r) => r.creator_id as string)
  console.log(`[sync-all] Found ${creatorIds.length} active Instagram integration(s)`)

  // ── Sync each creator sequentially ──────────────────────────────────────
  const results: Array<{ creator_id: string; success: boolean; error?: string }> = []

  for (const creatorId of creatorIds) {
    const result = await triggerFullSync(creatorId)
    results.push({ creator_id: creatorId, ...result })
    console.log(`[sync-all] creator=${creatorId}`, result.success ? '✓ synced' : `✗ ${result.error}`)
  }

  const succeeded = results.filter((r) => r.success).length
  const failed    = results.length - succeeded

  return NextResponse.json({
    synced_at: new Date().toISOString(),
    total:     results.length,
    succeeded,
    failed,
    results,
  })
}
