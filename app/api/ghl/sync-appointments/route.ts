import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

interface GhlEvent {
  id:          string
  title?:      string
  startTime?:  string
  endTime?:    string
  status?:     string
  appointmentStatus?: string
  calendarId?: string
  contactId?:  string
  assignedUserId?: string
  contact?: {
    id?:        string
    firstName?: string
    lastName?:  string
    email?:     string
    phone?:     string
    name?:      string
  }
}

interface GhlEventsResponse {
  events?: GhlEvent[]
}

interface GhlUser {
  id:        string
  name:      string
  firstName?: string
  lastName?:  string
  deleted?:   boolean
}

interface GhlUsersResponse {
  users?: GhlUser[]
}

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin    = createAdminClient()
  const baseUrl  = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'

  // 1. Read creator's GHL key + location ID
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('ghl_api_key, ghl_location_id')
    .eq('id', creatorId)
    .maybeSingle()

  const apiKey     = profile?.ghl_api_key
  const locationId = profile?.ghl_location_id

  if (!apiKey) {
    return NextResponse.json({
      error: 'GHL Private Integration key not set. Go to Settings → GHL Private Integration Key.',
    }, { status: 400 })
  }
  if (!locationId) {
    return NextResponse.json({ error: 'GHL Location ID not set for this creator' }, { status: 400 })
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
  }

  // 2. Fetch all users in this location
  let userIds: string[] = []
  try {
    const usersRes = await fetch(`${baseUrl}/users/?locationId=${locationId}`, { headers })
    if (usersRes.ok) {
      const usersData = await usersRes.json() as GhlUsersResponse
      userIds = (usersData.users ?? [])
        .filter(u => !u.deleted)
        .map(u => u.id)
      console.log(`[ghl/sync-appointments] found ${userIds.length} users`)
    } else {
      const body = await usersRes.text()
      console.error('[ghl/sync-appointments] users fetch failed:', usersRes.status, body)
      return NextResponse.json({ error: `Failed to fetch GHL users: ${usersRes.status}` }, { status: 500 })
    }
  } catch (err) {
    console.error('[ghl/sync-appointments] users fetch error:', err)
    return NextResponse.json({ error: 'Failed to reach GHL API' }, { status: 500 })
  }

  // 3. Fetch events per user and combine
  const startIso = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const endIso   = new Date(Date.now() + 90 * 86_400_000).toISOString()
  const allEvents: GhlEvent[] = []

  for (const userId of userIds) {
    try {
      const url = `${baseUrl}/calendars/events?locationId=${locationId}&userId=${userId}&startTime=${startIso}&endTime=${endIso}`
      const res = await fetch(url, { headers: { ...headers, Version: '2021-04-15' } })
      if (!res.ok) {
        console.warn(`[ghl/sync-appointments] events failed for user ${userId}:`, res.status)
        continue
      }
      const data = await res.json() as GhlEventsResponse
      const events = (data.events ?? []).filter(e =>
        e.appointmentStatus !== 'cancelled' && e.status !== 'cancelled'
      )
      console.log(`[ghl/sync-appointments] user ${userId}: ${events.length} events`)
      allEvents.push(...events)
    } catch (err) {
      console.warn(`[ghl/sync-appointments] error for user ${userId}:`, err)
    }
  }

  // Deduplicate by event id
  const seen = new Set<string>()
  const appointments = allEvents.filter(e => {
    if (!e.id || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  console.log(`[ghl/sync-appointments] total unique events: ${appointments.length}`)

  // 4. Upsert leads
  let synced = 0, created = 0, updated = 0

  for (const appt of appointments) {
    const contactId = appt.contactId ?? appt.contact?.id
    const startTime = appt.startTime
    if (!startTime || !contactId) continue

    const bookedAt  = new Date(startTime).toISOString()
    const firstName = appt.contact?.firstName ?? ''
    const lastName  = appt.contact?.lastName  ?? ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const name = appt.contact?.name ?? fullName ?? appt.title ?? 'Unknown'
    const email = appt.contact?.email?.toLowerCase().trim() ?? null
    const phone = appt.contact?.phone ?? null

    // Check existing lead
    let existingId: string | null = null

    const { data: byContact } = await admin
      .from('leads')
      .select('id, booked_at')
      .eq('creator_id', creatorId)
      .eq('ghl_contact_id', contactId)
      .maybeSingle()
    if (byContact) existingId = byContact.id

    if (!existingId && email) {
      const { data: byEmail } = await admin
        .from('leads')
        .select('id, booked_at')
        .eq('creator_id', creatorId)
        .eq('email', email)
        .maybeSingle()
      if (byEmail) existingId = byEmail.id
    }

    if (existingId) {
      await admin
        .from('leads')
        .update({
          booked_at:      bookedAt,
          ghl_contact_id: contactId,
          updated_at:     new Date().toISOString(),
        })
        .eq('id', existingId)
      updated++
      synced++
    } else {
      const { data: newLead, error } = await admin
        .from('leads')
        .insert({
          creator_id:       creatorId,
          name,
          email,
          phone,
          stage:            'call_booked',
          offer_tier:       'ht',
          pipeline_type:    'main',
          lead_source_type: 'vsl_funnel',
          ghl_contact_id:   contactId,
          booked_at:        bookedAt,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[ghl/sync-appointments] insert error:', error.message)
        continue
      }

      await admin.from('lead_stage_history').insert({
        lead_id:    newLead.id,
        from_stage: null,
        to_stage:   'call_booked',
        changed_by: null,
        note:       'Created via GHL appointment sync',
      })

      created++
      synced++
    }
  }

  console.log(`[ghl/sync-appointments] done — synced:${synced} created:${created} updated:${updated}`)
  return NextResponse.json({ synced, created, updated })
}
