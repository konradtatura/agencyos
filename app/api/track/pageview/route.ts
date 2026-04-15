import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function resolveCreatorId(
  admin: ReturnType<typeof createAdminClient>,
  locationId: string | undefined
): Promise<string | null> {
  if (locationId) {
    const { data } = await admin
      .from('creator_profiles')
      .select('id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()
    if (data?.id) return data.id
  }
  const { data: all } = await admin.from('creator_profiles').select('id').limit(2)
  if (all?.length === 1) return all[0].id
  return process.env.GHL_DEFAULT_CREATOR_ID ?? null
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const {
    location_id,
    page_path,
    page_name,
    session_id,
    referrer,
    visited_at,
    device_type,
    referrer_source,
    funnel_name,
  } = body as Record<string, string>

  if (!session_id || !page_path) {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  const creatorId = await resolveCreatorId(admin, location_id)

  if (!creatorId) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin
    .from('funnel_pageviews')
    .upsert(
      {
        creator_id:      creatorId,
        location_id:     String(location_id ?? ''),
        page_path:       String(page_path),
        page_name:       String(page_name ?? ''),
        session_id:      String(session_id),
        referrer:        String(referrer ?? ''),
        referrer_source: String(referrer_source ?? 'direct'),
        funnel_name:     String(funnel_name ?? ''),
        device_type:     String(device_type ?? ''),
        visited_at:      visited_at ?? new Date().toISOString(),
      },
      { onConflict: 'session_id,page_path', ignoreDuplicates: true }
    )

  if (error) console.error('[track/pageview] upsert error:', error)

  return NextResponse.json({ ok: true })
}
