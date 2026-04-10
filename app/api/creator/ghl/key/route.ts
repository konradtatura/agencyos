import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const { data } = await admin
    .from('creator_profiles')
    .select('ghl_api_key')
    .eq('id', creatorId)
    .maybeSingle()
  return NextResponse.json({ configured: !!data?.ghl_api_key })
}

export async function POST(req: Request) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { api_key } = await req.json() as { api_key?: string }
  if (!api_key?.trim()) {
    return NextResponse.json({ error: 'api_key required' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('creator_profiles')
    .update({ ghl_api_key: api_key.trim() })
    .eq('id', creatorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
