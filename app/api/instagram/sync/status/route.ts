import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Resolve creator profile
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // Check integration status + username
  const { data: integration } = await admin
    .from('integrations')
    .select('status, meta')
    .eq('creator_id', profile.id)
    .eq('platform', 'instagram')
    .maybeSingle()

  const connected   = integration?.status === 'active'
  const ig_username = (integration?.meta as { username?: string } | null)?.username ?? null

  if (!connected) {
    return NextResponse.json({ connected: false, ig_username: null, last_sync: null, next_sync: null })
  }

  // Most recent snapshot date = last successful sync
  const { data: latest } = await admin
    .from('instagram_account_snapshots')
    .select('created_at')
    .eq('creator_id', profile.id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const last_sync = latest?.created_at ?? null
  const next_sync = last_sync
    ? new Date(new Date(last_sync).getTime() + SYNC_INTERVAL_MS).toISOString()
    : null

  return NextResponse.json({ connected, ig_username, last_sync, next_sync })
}
