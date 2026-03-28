import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triggerFullSync } from '@/lib/instagram/sync'

// ── POST /api/instagram/sync ──────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const result = await triggerFullSync(profile.id)
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

// ── GET /api/instagram/sync/status ── (kept in same file via Next.js route segment)
// Status is served from /api/instagram/sync/status — see status/route.ts
