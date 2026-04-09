import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GHL sends appointment/contact data as a flat object with custom fields
// The payload shape varies by GHL workflow trigger, so we normalise it here.
interface GhlCustomField {
  id?: string
  key?: string
  field_value?: string
  value?: string
}

interface GhlPayload {
  // Contact fields
  contact_id?: string
  id?: string                        // fallback contact id key
  first_name?: string
  last_name?: string
  full_name?: string
  name?: string
  email?: string
  phone?: string

  // Appointment fields (flat — older GHL workflows)
  appointment_id?: string
  start_time?: string
  scheduled_at?: string

  // Appointment fields (nested calendar object — current GHL workflows)
  calendar?: {
    startTime?: string
    id?: string
    title?: string
  }

  // Team assignment
  assigned_user_id?: string          // GHL user id of the closer
  assigned_user_email?: string

  // Sub-account / location mapping → creator
  location_id?: string

  // Custom fields — GHL sends these in different shapes depending on version
  custom_fields?: GhlCustomField[]
  customField?: GhlCustomField[]
  customData?: Record<string, string>
}

function extractName(body: GhlPayload): string {
  if (body.full_name) return body.full_name
  if (body.name) return body.name
  const parts = [body.first_name, body.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (body.email) return body.email.toLowerCase().trim()
  return 'Unknown'
}

function extractTallyAnswers(body: GhlPayload): Record<string, string> | null {
  const fields = body.custom_fields ?? body.customField ?? []
  if (fields.length === 0 && !body.customData) return null

  const answers: Record<string, string> = {}

  for (const f of fields) {
    const key = f.key ?? f.id ?? 'field'
    const val = f.field_value ?? f.value ?? ''
    answers[key] = val
  }

  if (body.customData) {
    Object.assign(answers, body.customData)
  }

  return Object.keys(answers).length ? answers : null
}

async function resolveGhlCreatorId(
  supabase: ReturnType<typeof createAdminClient>,
  payloadLocationId: string | undefined,
): Promise<string | null> {
  const locationId = payloadLocationId ?? process.env.GHL_LOCATION_ID

  // 1. Match location_id stored in creator_profiles (correct table)
  if (locationId) {
    const { data } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()

    if (data?.id) {
      console.log(`[ghl-webhook] resolved creator via creator_profiles (location_id=${locationId}): ${data.id}`)
      return data.id
    }
  }

  // 2. If only one creator exists, use them as default (single-creator agencies)
  const { data: allCreators } = await supabase
    .from('creator_profiles')
    .select('id')
    .limit(2)

  if (allCreators?.length === 1) {
    console.log(`[ghl-webhook] single creator — using as default: ${allCreators[0].id}`)
    return allCreators[0].id
  }

  // 3. Fall back to env var
  const defaultId = process.env.GHL_DEFAULT_CREATOR_ID
  if (defaultId) {
    console.log(`[ghl-webhook] using GHL_DEFAULT_CREATOR_ID: ${defaultId}`)
    return defaultId
  }

  return null
}

export async function POST(req: NextRequest) {
  let body: GhlPayload
  try {
    body = (await req.json()) as GhlPayload
  } catch {
    console.error('[ghl-webhook] failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[ghl-webhook] payload received:', JSON.stringify(body, null, 2))

  const supabase = createAdminClient()

  // --- Resolve creator ---
  const creatorId = await resolveGhlCreatorId(supabase, body.location_id)
  if (!creatorId) {
    console.error('[ghl-webhook] could not resolve creator_id — set GHL_DEFAULT_CREATOR_ID or GHL_LOCATION_ID')
    return NextResponse.json({ error: 'Creator not found' }, { status: 422 })
  }

  const name = extractName(body)
  const email = body.email?.toLowerCase().trim() ?? null
  const phone = body.phone ?? null
  const ghlContactId = body.contact_id ?? body.id ?? null
  const rawStartTime = body.calendar?.startTime ?? body.start_time ?? body.scheduled_at ?? null
  const bookedAt = rawStartTime ? new Date(rawStartTime).toISOString() : null
  const tallyAnswers = extractTallyAnswers(body)

  // --- Upsert: check if lead with same email already exists for this creator ---
  let existingLeadId: string | null = null

  if (email) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id, stage')
      .eq('creator_id', creatorId)
      .eq('email', email)
      .maybeSingle()

    if (existing) existingLeadId = existing.id
  }

  console.log(`[ghl-webhook] resolved values — name: "${name}", email: ${email}, creator_id: ${creatorId}`)

  try {
    if (existingLeadId) {
      // Update existing lead to call_booked
      const { error } = await supabase
        .from('leads')
        .update({
          stage: 'call_booked',
          lead_source_type: 'vsl_funnel',
          ghl_contact_id: ghlContactId,
          booked_at: bookedAt,
          tally_answers: tallyAnswers,
          phone: phone ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLeadId)

      if (error) throw error

      // Log stage change
      await supabase.from('lead_stage_history').insert({
        lead_id: existingLeadId,
        from_stage: null,       // unknown prior stage without extra query
        to_stage: 'call_booked',
        changed_by: null,       // system / webhook
        note: 'Updated via GHL webhook (appointment booked)',
      })

      console.log(`[ghl-webhook] updated lead ${existingLeadId} → call_booked (${email})`)
      return NextResponse.json({ ok: true, lead_id: existingLeadId, action: 'updated' })
    } else {
      // Create new lead
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          creator_id: creatorId,
          name,
          email,
          phone,
          stage: 'call_booked',
          offer_tier: 'ht',           // VSL funnel → high ticket by default
          pipeline_type: 'main',
          lead_source_type: 'vsl_funnel',
          ghl_contact_id: ghlContactId,
          booked_at: bookedAt,
          tally_answers: tallyAnswers,
        })
        .select('id')
        .single()

      if (error) throw error

      // Log initial stage
      await supabase.from('lead_stage_history').insert({
        lead_id: newLead.id,
        from_stage: null,
        to_stage: 'call_booked',
        changed_by: null,
        note: 'Created via GHL webhook (appointment booked)',
      })

      console.log(`[ghl-webhook] created lead ${newLead.id} → call_booked (${email ?? name})`)
      return NextResponse.json({ ok: true, lead_id: newLead.id, action: 'created' })
    }
  } catch (err) {
    console.error('[ghl-webhook] database error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
