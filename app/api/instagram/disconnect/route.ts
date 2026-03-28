import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve creator_id for this user
  const { data: profile, error: profileError } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // Mark disconnected and clear the stored token
  const { error } = await supabase
    .from('integrations')
    .update({
      status:        'disconnected',
      access_token:  null,
    })
    .eq('creator_id', profile.id)
    .eq('platform', 'instagram')

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
