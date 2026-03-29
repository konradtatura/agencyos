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

  // Appointment fields
  appointment_id?: string
  start_time?: string                // ISO datetime of the booked call
  scheduled_at?: string

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

async function resolveCreatorId(
  supabase: ReturnType<typeof createAdminClient>,
  locationId: string | undefined,
): Promise<string | null> {
  // 1. Try matching GHL location_id stored in integrations.meta
  if (locationId) {
    const { data } = await supabase
      .from('integrations')
      .select('creator_id')
      .eq('platform', 'ghl')
      .eq('status', 'active')
      .contains('meta', { location_id: locationId })
      .maybeSingle()

    if (data?.creator_id) return data.creator_id
  }

  // 2. Fall back to env-configured default creator
  const defaultId = process.env.GHL_DEFAULT_CREATOR_ID
  if (defaultId) return defaultId

  // 3. Last resort — first active creator in the system
  const { data: firstCreator } = await supabase
    .from('creator_profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return firstCreator?.id ?? null
}

export async function POST(req: NextRequest) {
  // --- Auth: verify shared secret if configured ---
  const secret = process.env.GHL_WEBHOOK_SECRET
  if (secret) {
    const incoming =
      req.headers.get('x-ghl-signature') ??
      req.nextUrl.searchParams.get('secret')
    if (incoming !== secret) {
      console.warn('[ghl-webhook] rejected request: invalid secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: GhlPayload
  try {
    body = (await req.json()) as GhlPayload
  } catch {
    console.error('[ghl-webhook] failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // --- Resolve creator ---
  const creatorId = await resolveCreatorId(supabase, body.location_id)
  if (!creatorId) {
    console.error('[ghl-webhook] could not resolve creator_id — set GHL_DEFAULT_CREATOR_ID')
    return NextResponse.json({ error: 'Creator not found' }, { status: 422 })
  }

  const name = extractName(body)
  const email = body.email?.toLowerCase().trim() ?? null
  const phone = body.phone ?? null
  const ghlContactId = body.contact_id ?? body.id ?? null
  const bookedAt = body.start_time ?? body.scheduled_at ?? null
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
