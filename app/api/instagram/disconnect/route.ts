import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

export async function POST() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { admin, creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })

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
