/**
 * POST /api/instagram/analyze
 *
 * Triggers Claude-powered content analysis for the authenticated creator.
 * Analyzes the last 20 transcribed reels and returns a structured breakdown
 * of top topics, hooks, content pillars, and 5 actionable recommendations.
 *
 * This call can take 15–45 seconds with adaptive thinking enabled.
 * Returns { success: true, analysis, postCount } or { success: false, error }.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzeContent } from '@/lib/analysis/content-analyzer'

export async function POST() {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // ── Resolve creator ───────────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // ── Rate limit: max 3 per rolling 7-day window ────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: weeklyCount } = await admin
    .from('content_analyses')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', profile.id)
    .eq('platform', 'instagram')
    .gte('created_at', sevenDaysAgo)

  if ((weeklyCount ?? 0) >= 3) {
    return NextResponse.json(
      { success: false, error: 'Rate limit: maximum 3 analyses per 7-day window.' },
      { status: 429 },
    )
  }

  // ── Run analysis ──────────────────────────────────────────────────────────────
  const result = await analyzeContent(profile.id)

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    success:   true,
    analysis:  result.analysis,
    postCount: result.postCount,
  })
}
