import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

// Maps GHL tags → AgencyOS stage + offer_tier
const TAG_STAGE_MAP: Record<string, { stage: string; offer_tier?: string }> = {
  'new lead':                  { stage: 'qualifying' },
  'dm':                        { stage: 'qualifying' },
  'qualified':                 { stage: 'qualified' },
  'vsl qualified application': { stage: 'qualified' },
  'booked':                    { stage: 'call_booked' },
  'calendly':                  { stage: 'call_booked' },
  'call lead':                 { stage: 'call_booked' },
  'mt call':                   { stage: 'call_booked', offer_tier: 'mt' },
  'mt budget':                 { stage: 'qualifying',  offer_tier: 'mt' },
  'call picked up':            { stage: 'showed' },
  'no answer':                 { stage: 'no_show' },
  'no show':                   { stage: 'no_show' },
  'no show follow up':         { stage: 'no_show' },
  'closed':                    { stage: 'closed_won' },
  'closed mid-ticket':         { stage: 'closed_won',  offer_tier: 'mt' },
  'no close':                  { stage: 'closed_lost' },
  "didn't close":              { stage: 'closed_lost' },
  'disqualified':              { stage: 'disqualified' },
  'dwcall':                    { stage: 'qualifying' },
  'bio':                       { stage: 'qualifying' },
}

interface GhlContact {
  id:         string
  firstName?: string
  lastName?:  string
  name?:      string
  email?:     string
  phone?:     string
  tags?:      string[]
  dateAdded?: string
}

interface GhlContactsResponse {
  contacts?: GhlContact[]
  meta?: { total?: number; nextPageUrl?: string }
}

function resolveStage(tags: string[]): { stage: string; offer_tier: string } {
  // Priority order — later stages override earlier ones
  const PRIORITY = [
    'qualifying', 'qualified', 'call_booked', 'showed',
    'no_show', 'closed_won', 'closed_lost', 'disqualified'
  ]

  let bestStage    = 'qualifying'
  let bestTier     = 'ht'
  let bestPriority = -1

  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim()
    const mapping = TAG_STAGE_MAP[normalized]
    if (!mapping) continue

    const priority = PRIORITY.indexOf(mapping.stage)
    if (priority > bestPriority) {
      bestPriority = priority
      bestStage    = mapping.stage
      if (mapping.offer_tier) bestTier = mapping.offer_tier
    }
  }

  return { stage: bestStage, offer_tier: bestTier }
}

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin   = createAdminClient()
  const baseUrl = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'

  // 1. Read creator's GHL key + location ID
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('ghl_api_key, ghl_location_id')
    .eq('id', creatorId)
    .maybeSingle()

  const apiKey     = profile?.ghl_api_key
  const locationId = profile?.ghl_location_id

  console.log('[ghl/sync] apiKey present:', !!apiKey, 'locationId:', locationId, 'apiKey prefix:', apiKey ? apiKey.slice(0, 10) : 'MISSING')

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

  // 2. Fetch all contacts (paginated)
  const allContacts: GhlContact[] = []
  let page = 1
  const limit = 100

  while (true) {
    try {
      const url = `${baseUrl}/contacts/?locationId=${locationId}&limit=${limit}&skip=${(page - 1) * limit}`
      const res = await fetch(url, { headers })

      if (!res.ok) {
        const body = await res.text()
        console.error('[ghl/sync] contacts fetch failed:', res.status, body)
        break
      }

      const data = await res.json() as GhlContactsResponse
      const contacts = data.contacts ?? []
      allContacts.push(...contacts)

      console.log(`[ghl/sync] page ${page}: ${contacts.length} contacts (total so far: ${allContacts.length})`)

      if (contacts.length < limit) break
      page++

      // Safety limit — max 1000 contacts
      if (allContacts.length >= 1000) break
    } catch (err) {
      console.error('[ghl/sync] contacts fetch error:', err)
      break
    }
  }

  console.log(`[ghl/sync] total contacts fetched: ${allContacts.length}`)

  // Only sync contacts that have at least one recognized tag
  const contactsWithTags = allContacts.filter(c =>
    (c.tags ?? []).some(t => TAG_STAGE_MAP[t.toLowerCase().trim()])
  )

  console.log(`[ghl/sync] contacts with recognized tags: ${contactsWithTags.length}`)

  // 3. Upsert leads
  let synced = 0, created = 0, updated = 0, skipped = 0

  for (const contact of contactsWithTags) {
    const tags = contact.tags ?? []
    const { stage, offer_tier } = resolveStage(tags)
    const name  = contact.name
      ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      || 'Unknown'
    const email = contact.email?.toLowerCase().trim() ?? null
    const phone = contact.phone ?? null
    const ghlId = contact.id

    // Check existing lead by ghl_contact_id or email
    let existingId: string | null = null

    const { data: byGhl } = await admin
      .from('leads')
      .select('id, stage')
      .eq('creator_id', creatorId)
      .eq('ghl_contact_id', ghlId)
      .maybeSingle()
    if (byGhl) existingId = byGhl.id

    if (!existingId && email) {
      const { data: byEmail } = await admin
        .from('leads')
        .select('id, stage')
        .eq('creator_id', creatorId)
        .eq('email', email)
        .maybeSingle()
      if (byEmail) existingId = byEmail.id
    }

    if (existingId) {
      await admin
        .from('leads')
        .update({
          stage,
          offer_tier,
          ghl_contact_id: ghlId,
          updated_at: new Date().toISOString(),
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
          stage,
          offer_tier,
          pipeline_type:    'main',
          lead_source_type: 'organic',
          ghl_contact_id:   ghlId,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[ghl/sync] insert error:', error.message, 'contact:', ghlId)
        skipped++
        continue
      }

      await admin.from('lead_stage_history').insert({
        lead_id:    newLead.id,
        from_stage: null,
        to_stage:   stage,
        changed_by: null,
        note:       'Imported via GHL contact sync',
      })

      created++
      synced++
    }
  }

  console.log(`[ghl/sync] done — synced:${synced} created:${created} updated:${updated} skipped:${skipped}`)
  return NextResponse.json({ synced, created, updated, skipped })
}
