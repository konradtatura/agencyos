import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const baseUrl = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('ghl_api_key, ghl_location_id')
    .eq('id', creatorId)
    .maybeSingle()

  const apiKey    = profile?.ghl_api_key
  const locationId = profile?.ghl_location_id

  console.log('[ghl/sync] apiKey present:', !!apiKey, 'locationId:', locationId)

  if (!apiKey) return NextResponse.json({ error: 'GHL Private Integration key not set. Go to Settings.' }, { status: 400 })
  if (!locationId) return NextResponse.json({ error: 'GHL Location ID not set' }, { status: 400 })

  const headers = { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28' }

  // Offer tier mapping by stage name
  const MT_STAGES = new Set(['MT Budget', 'Mid Ticket PiF', 'Mid Ticket Split', 'Booked MT Call', 'Low Ticket'])

  const STAGE_ID_TO_NAME: Record<string, string> = {
    'fd5ee6e8-c250-48b7-8845-834e95771b3e': 'Disqualified',
    '751071bd-4bb7-4051-a27a-a8d568116a48': 'MT Budget',
    'f9b814b8-d128-484d-8a4c-adeaa7be56b5': 'Qualified',
    '90e1d5d1-b327-42b5-acec-9eb43b626ef7': 'Low Ticket',
    '1081113e-f541-409b-bc69-786f95e86cdc': 'Mid Ticket PiF',
    'cef37f2b-cd8a-48e2-ba99-f40b944d9659': 'Mid Ticket Split',
    '3f6aa5f6-895c-4e62-9c53-3de75f819640': 'Booked MT Call',
    '283f78d0-abee-4626-8c5a-05662e2ae6eb': 'Booked',
    '1bdb581b-3c6f-4658-a281-ed2797395123': 'No-show',
    '2bf2ed1d-e6cb-4537-a566-59af9bfefd17': 'No-close',
    'e557a30b-7805-4876-b786-0dda154caf21': 'High Ticket PiF',
    '07c61802-947b-48fb-840f-6e2282c55cba': 'High Ticket Split',
  }

  // Fetch all opportunities (paginated)
  const allOpps: {
    id: string
    pipelineStageId: string
    monetaryValue?: number
    contact: {
      id: string
      name?: string
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
    }
  }[] = []

  let page = 1
  while (true) {
    const url = `${baseUrl}/opportunities/search?location_id=${locationId}&limit=100&page=${page}`
    let res: Response
    try {
      res = await fetch(url, { headers })
    } catch (err) {
      console.error('[ghl/sync] fetch error:', err)
      return NextResponse.json({ error: 'Failed to reach GHL API' }, { status: 500 })
    }

    if (!res.ok) {
      const body = await res.text()
      console.error('[ghl/sync] opportunities fetch failed:', res.status, body)
      return NextResponse.json({ error: `GHL API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json() as {
      opportunities?: typeof allOpps
      meta?: { total?: number; nextPage?: number | null; currentPage?: number }
    }

    const opps = data.opportunities ?? []
    allOpps.push(...opps)
    console.log(`[ghl/sync] page ${page}: ${opps.length} opportunities (total so far: ${allOpps.length})`)

    if (!data.meta?.nextPage || opps.length === 0) break
    page++
    if (allOpps.length >= 500) break
  }

  console.log('[ghl/sync] total opportunities:', allOpps.length)

  let synced = 0, created = 0, updated = 0, skipped = 0

  for (const opp of allOpps) {
    const stage      = STAGE_ID_TO_NAME[opp.pipelineStageId] ?? 'Qualified'
    const offer_tier = MT_STAGES.has(stage) ? 'mt' : 'ht'
    const contact    = opp.contact
    const ghlId      = contact.id

    const parts   = [contact.firstName, contact.lastName].filter(Boolean)
    const fullName = parts.join(' ')
    const name     = (contact.name ?? fullName) || 'Unknown'
    const email    = contact.email?.toLowerCase().trim() ?? null
    const phone    = contact.phone ?? null

    // Check existing by ghl_contact_id or email
    let existingId: string | null = null

    const { data: byGhl } = await admin
      .from('leads')
      .select('id')
      .eq('creator_id', creatorId)
      .eq('ghl_contact_id', ghlId)
      .maybeSingle()
    if (byGhl) existingId = byGhl.id

    if (!existingId && email) {
      const { data: byEmail } = await admin
        .from('leads')
        .select('id')
        .eq('creator_id', creatorId)
        .eq('email', email)
        .maybeSingle()
      if (byEmail) existingId = byEmail.id
    }

    if (existingId) {
      await admin
        .from('leads')
        .update({ stage, offer_tier, ghl_contact_id: ghlId, updated_at: new Date().toISOString() })
        .eq('id', existingId)
      updated++
      synced++
    } else {
      const { data: newLead, error } = await admin
        .from('leads')
        .insert({
          creator_id:       creatorId,
          name, email, phone, stage, offer_tier,
          pipeline_type:    'main',
          lead_source_type: 'organic',
          ghl_contact_id:   ghlId,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[ghl/sync] insert error:', error.message, 'stage:', stage)
        skipped++
        continue
      }

      await admin.from('lead_stage_history').insert({
        lead_id: newLead.id, from_stage: null, to_stage: stage,
        changed_by: null, note: 'Imported via GHL opportunity sync',
      })
      created++
      synced++
    }
  }

  console.log('[ghl/sync] done — synced:', synced, 'created:', created, 'updated:', updated, 'skipped:', skipped)

  // Second pass: fetch appointment times for booked leads without booked_at
  const GHL_TO_AGENCYOS_CLOSER: Record<string, string> = {
    'vAQWK7yqxxHHCKgEfk1m': '037464a8-a9a8-4402-b193-174de07a73f7',
  }

  const { data: bookedLeads } = await admin
    .from('leads')
    .select('id, ghl_contact_id, stage')
    .eq('creator_id', creatorId)
    .in('stage', ['Booked', 'Booked MT Call'])
    .is('booked_at', null)
    .not('ghl_contact_id', 'is', null)

  console.log('[ghl/sync] fetching appointment times for', bookedLeads?.length ?? 0, 'booked leads')

  let bookedAtUpdated = 0
  for (const lead of bookedLeads ?? []) {
    try {
      const apptRes = await fetch(
        `${baseUrl}/contacts/${lead.ghl_contact_id}/appointments`,
        { headers }
      )
      if (!apptRes.ok) {
        const errBody = await apptRes.text()
        console.log('[ghl/sync] appointments fetch failed for', lead.ghl_contact_id, ':', apptRes.status, errBody.slice(0, 100))
        continue
      }

      const apptData = await apptRes.json() as {
        events?: { startTime?: string; status?: string; appointmentStatus?: string; assignedUserId?: string }[]
        appointments?: { startTime?: string; status?: string; appointmentStatus?: string; assignedUserId?: string }[]
      }

      console.log('[ghl/sync] contact', lead.ghl_contact_id, 'has', (apptData.events ?? apptData.appointments ?? []).length, 'appointments')

      const appts = (apptData.events ?? apptData.appointments ?? [])
        .filter(a => a.status !== 'cancelled' && a.appointmentStatus !== 'cancelled' && a.startTime)
        .sort((a, b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime())

      if (appts.length > 0) {
        const rawTime    = appts[0].startTime!
        const normalized = rawTime.includes('T') ? rawTime : rawTime.replace(' ', 'T') + 'Z'
        const bookedAt   = new Date(normalized).toISOString()

        const updateData: Record<string, unknown> = { booked_at: bookedAt }

        const ghlCloserId    = appts[0].assignedUserId
        const agencyCloserId = ghlCloserId ? GHL_TO_AGENCYOS_CLOSER[ghlCloserId] : null
        if (agencyCloserId) updateData.assigned_closer_id = agencyCloserId

        await admin.from('leads').update(updateData).eq('id', lead.id)
        bookedAtUpdated++
        console.log('[ghl/sync] set booked_at for', lead.ghl_contact_id, '→', bookedAt)
      }
    } catch (err) {
      console.log('[ghl/sync] catch error for', lead.ghl_contact_id, ':', String(err))
      continue
    }
  }

  console.log('[ghl/sync] booked_at updated for', bookedAtUpdated, 'leads')
  return NextResponse.json({ synced, created, updated, skipped, bookedAtUpdated })
}
