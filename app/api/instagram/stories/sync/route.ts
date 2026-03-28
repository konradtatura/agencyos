/**
 * POST /api/instagram/stories/sync
 *
 * Triggers a story sync for the authenticated creator.
 * Stories sync is fast (≤ 20 active stories) so plain JSON is fine — no SSE.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncStories } from '@/lib/instagram/sync-stories'

export async function POST() {
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

  const outcome = await syncStories(profile.id)

  if (!outcome.success) {
    return NextResponse.json({ error: outcome.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, synced_count: outcome.synced_count })
}
