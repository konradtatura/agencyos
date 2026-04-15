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
  // Single creator fallback
  const { data: all } = await admin.from('creator_profiles').select('id').limit(2)
  if (all?.length === 1) return all[0].id
  return process.env.GHL_DEFAULT_CREATOR_ID ?? null
}

export async function POST(req: NextRequest) {
  // Verify shared secret
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.GHL_WEBHOOK_SECRET || secret !== process.env.GHL_WEBHOOK_SECRET) {
    console.warn('[ghl-funnel] unauthorized webhook attempt')
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true }) // silently accept malformed payloads
  }

  const {
    event,
    location_id,
    contact_id,
    page_path,
    page_name,
    funnel_name,
    funnel_id,
    timestamp,
  } = body as Record<string, string>

  if (!contact_id || !page_path) {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  const creatorId = await resolveCreatorId(admin, location_id)

  if (!creatorId) {
    console.error('[ghl-funnel] could not resolve creator for location_id:', location_id)
    return NextResponse.json({ ok: true })
  }

  const visitedAt = timestamp ?? new Date().toISOString()

  // Always record a page view.
  // Using contact_id as session_id: one unique view per contact per page.
  // Same contact visiting twice still counts as 1 unique view — matches GHL's "Unique" column.
  const { error: viewError } = await admin
    .from('funnel_pageviews')
    .upsert(
      {
        creator_id:      creatorId,
        location_id:     String(location_id ?? ''),
        page_path:       String(page_path),
        page_name:       String(page_name ?? ''),
        session_id:      String(contact_id),
        funnel_name:     String(funnel_name ?? ''),
        referrer:        String(funnel_id ?? ''),
        referrer_source: event === 'form_submit' ? 'opt_in' : 'ghl_page_view',
        visited_at:      visitedAt,
      },
      { onConflict: 'session_id,page_path', ignoreDuplicates: true }
    )

  if (viewError) console.error('[ghl-funnel] pageview upsert error:', viewError)

  // If form submission, also record as opt-in
  if (event === 'form_submit') {
    const { error: optInError } = await admin
      .from('funnel_opt_ins')
      .upsert(
        {
          creator_id:  creatorId,
          location_id: String(location_id ?? ''),
          contact_id:  String(contact_id),
          page_path:   String(page_path),
          page_name:   String(page_name ?? ''),
          funnel_name: String(funnel_name ?? ''),
          opted_in_at: visitedAt,
        },
        { onConflict: 'contact_id,page_path', ignoreDuplicates: true }
      )

    if (optInError) console.error('[ghl-funnel] opt-in upsert error:', optInError)
  }

  console.log(`[ghl-funnel] recorded ${event ?? 'page_view'} for contact ${contact_id} on ${page_path}`)
  return NextResponse.json({ ok: true })
}
