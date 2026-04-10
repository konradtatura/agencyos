/**
 * POST /api/ghl/sync-appointments
 *
 * Pulls appointments from GHL for the current creator and upserts them
 * as leads with stage = 'call_booked'.
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

interface GhlAppointment {
  id:          string
  contactId?:  string
  title?:      string
  startTime?:  string
  endTime?:    string
  status?:     string
  calendarId?: string
  contact?: {
    id?:        string
    firstName?: string
    lastName?:  string
    email?:     string
    phone?:     string
  }
}

interface GhlAppointmentsResponse {
  events?:       GhlAppointment[]
  appointments?: GhlAppointment[]
}

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 1. Read GHL API key + location ID from creator_profiles
  const { data: creatorProfile } = await admin
    .from('creator_profiles')
    .select('ghl_api_key, ghl_location_id')
    .eq('id', creatorId)
    .maybeSingle()

  const apiKey     = creatorProfile?.ghl_api_key
  const locationId = creatorProfile?.ghl_location_id

  if (!apiKey) {
    return NextResponse.json({
      error: 'GHL Private Integration key not set. Go to Settings → GHL Private Integration Key and add it.',
    }, { status: 400 })
  }
  if (!locationId) {
    return NextResponse.json({ error: 'GHL Location ID not set for this creator' }, { status: 400 })
  }

  // 3. Fetch appointments from GHL (now - 30 days to now + 60 days)
  const now      = Date.now()
  const startMs  = now - 30 * 86_400_000
  const endMs    = now + 60 * 86_400_000
  const baseUrl  = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'

  const url = `${baseUrl}/calendars/events?locationId=${locationId}&startTime=${startMs}&endTime=${endMs}&limit=100`

  let ghlData: GhlAppointmentsResponse
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-04-15',
      },
    })

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: 'GHL API key is invalid or expired' }, { status: 400 })
    }
    if (!res.ok) {
      const body = await res.text()
      console.error('[ghl/sync-appointments] GHL API error:', res.status, body)
      return NextResponse.json({ error: `GHL API returned ${res.status}` }, { status: 500 })
    }

    ghlData = await res.json() as GhlAppointmentsResponse
  } catch (err) {
    console.error('[ghl/sync-appointments] fetch error:', err)
    return NextResponse.json({ error: 'Failed to reach GHL API' }, { status: 500 })
  }

  const appointments = ghlData.events ?? ghlData.appointments ?? []
  let synced = 0, created = 0, updated = 0

  for (const appt of appointments) {
    const contactId = appt.contactId ?? appt.contact?.id
    const startTime = appt.startTime
    if (!startTime) continue

    const bookedAt   = new Date(startTime).toISOString()
    const firstName  = appt.contact?.firstName ?? ''
    const lastName   = appt.contact?.lastName  ?? ''
    const name       = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'
    const email      = appt.contact?.email?.toLowerCase().trim() ?? null
    const phone      = appt.contact?.phone ?? null

    // Check for existing lead by ghl_contact_id or email
    let existingId: string | null = null

    if (contactId) {
      const { data: byContact } = await admin
        .from('leads')
        .select('id, booked_at')
        .eq('creator_id', creatorId)
        .eq('ghl_contact_id', contactId)
        .maybeSingle()
      if (byContact) existingId = byContact.id
    }

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
      // Update booked_at if not already set
      const { data: existing } = await admin
        .from('leads')
        .select('booked_at')
        .eq('id', existingId)
        .single()

      if (!existing?.booked_at) {
        await admin
          .from('leads')
          .update({ booked_at: bookedAt, ghl_contact_id: contactId ?? null, updated_at: new Date().toISOString() })
          .eq('id', existingId)
        updated++
      }
      synced++
    } else {
      // Create new lead
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
          ghl_contact_id:   contactId ?? null,
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
