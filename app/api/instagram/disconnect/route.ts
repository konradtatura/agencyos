import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  // Mark disconnected and clear the stored token
  const { error } = await admin
    .from('integrations')
    .update({
      status:        'disconnected',
      access_token:  null,
    })
    .eq('creator_id', creatorId)
    .eq('platform', 'instagram')

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
