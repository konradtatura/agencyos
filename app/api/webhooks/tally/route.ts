/**
 * POST /api/webhooks/tally  (PUBLIC — no auth required)
 *
 * Receives Tally form submission webhooks and:
 * 1. Upserts the submission into tally_submissions
 * 2. If the form has is_qualification_form = true, creates or enriches a CRM lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapTallySubmission, type TallyField } from '@/lib/tally/mapFields'

interface TallyWebhookPayload {
  formId?: string
  form_id?: string
  data?: {
    formId?: string
    fields?: TallyField[]
    submissionId?: string
    createdAt?: string
    respondentId?: string
  }
  fields?: TallyField[]
  submissionId?: string
  createdAt?: string
}

function formatAnswersNote(formName: string, answers: Record<string, unknown>): string {
  const lines = Object.entries(answers)
    .map(([q, a]) => `${q}: ${a ?? '—'}`)
    .join('\n')
  return `Created from Tally form: ${formName}\n\n${lines}`
}

export async function POST(req: NextRequest) {
  let body: TallyWebhookPayload
  try {
    body = (await req.json()) as TallyWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Normalise Tally payload — they nest under data in some versions
  const formId       = body.formId ?? body.form_id ?? body.data?.formId
  const fields       = body.fields ?? body.data?.fields ?? []
  const submissionId = body.submissionId ?? body.data?.submissionId
  const submittedAt  = body.createdAt ?? body.data?.createdAt ?? new Date().toISOString()

  if (!formId) {
    console.warn('[tally-webhook] missing formId in payload')
    return NextResponse.json({ ok: true })   // 200 — ignore unknown shape
  }

  // -- Find the matching tally_form --
  const { data: form } = await admin
    .from('tally_forms')
    .select('id, creator_id, name, is_qualification_form, lead_source_type')
    .eq('tally_form_id', formId)
    .maybeSingle()

  if (!form) {
    // Unknown form — ignore gracefully
    return NextResponse.json({ ok: true })
  }

  // -- Map fields --
  const { name, phone, ig, answers } = mapTallySubmission(fields as TallyField[])

  // -- Upsert submission --
  const subId = submissionId ?? `${formId}_${Date.now()}`

  const { data: sub, error: subError } = await admin
    .from('tally_submissions')
    .upsert(
      {
        creator_id:           form.creator_id as string,
        form_id:              form.id as string,
        tally_submission_id:  subId,
        answers,
        respondent_name:      name,
        respondent_phone:     phone,
        respondent_ig_handle: ig,
        submitted_at:         submittedAt,
      },
      { onConflict: 'tally_submission_id' },
    )
    .select('id')
    .single()

  if (subError || !sub) {
    console.error('[tally-webhook] upsert submission error:', subError)
    return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
  }

  // Update form submission count (non-fatal)
  await admin.rpc('increment_tally_form_submissions', { p_form_id: form.id as string }).catch(() => {
    // Falls back to a direct update if the RPC isn't deployed yet
    admin
      .from('tally_forms')
      .update({ total_submissions: admin.rpc('coalesce_increment' as never) })
      .eq('id', form.id as string)
      .catch(() => undefined)
  })

  // -- Lead creation / enrichment (qualification forms only) --
  if (!form.is_qualification_form) {
    return NextResponse.json({ ok: true, submission_id: sub.id })
  }

  const creatorId = form.creator_id as string

  // Search for existing lead by ig_handle OR phone
  let existingLeadId: string | null = null

  if (ig || phone) {
    const orParts: string[] = []
    if (ig)    orParts.push(`ig_handle.eq.${ig}`)
    if (phone) orParts.push(`phone.eq.${phone}`)

    const { data: existing } = await admin
      .from('leads')
      .select('id, ig_handle, phone')
      .eq('creator_id', creatorId)
      .or(orParts.join(','))
      .maybeSingle()

    if (existing) existingLeadId = existing.id as string
  }

  const noteText = formatAnswersNote(form.name as string ?? 'Unknown form', answers)

  if (existingLeadId) {
    // Enrich existing lead — fill blanks and add note
    const { data: existingLead } = await admin
      .from('leads')
      .select('ig_handle, phone')
      .eq('id', existingLeadId)
      .single()

    const patch: Record<string, string | null> = {}
    if (!existingLead?.ig_handle && ig)    patch.ig_handle = ig
    if (!existingLead?.phone    && phone)  patch.phone     = phone

    if (Object.keys(patch).length > 0) {
      await admin
        .from('leads')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existingLeadId)
    }

    await admin.from('lead_notes').insert({
      lead_id:   existingLeadId,
      author_id: null,           // system note
      note_text: noteText,
    })

    await admin
      .from('tally_submissions')
      .update({ lead_id: existingLeadId })
      .eq('id', sub.id as string)

    return NextResponse.json({ ok: true, submission_id: sub.id, lead_id: existingLeadId, action: 'enriched' })
  }

  // -- Create new lead --
  const { data: newLead, error: leadError } = await admin
    .from('leads')
    .insert({
      creator_id:      creatorId,
      name:            name ?? 'Unknown',
      ig_handle:       ig   ?? null,
      phone:           phone ?? null,
      stage:           'dmd',
      lead_source_type: (form.lead_source_type as string) ?? 'organic',
      pipeline_type:   'main',
    })
    .select('id')
    .single()

  if (leadError || !newLead) {
    console.error('[tally-webhook] lead insert error:', leadError)
    return NextResponse.json({ ok: true, submission_id: sub.id })   // non-fatal
  }

  // Log initial stage
  await admin.from('lead_stage_history').insert({
    lead_id:    newLead.id as string,
    from_stage: null,
    to_stage:   'dmd',
    changed_by: null,
    note:       `Created via Tally webhook (form: ${form.name as string ?? formId})`,
  })

  // Add note with formatted answers
  await admin.from('lead_notes').insert({
    lead_id:   newLead.id as string,
    author_id: null,
    note_text: noteText,
  })

  // Link submission → lead
  await admin
    .from('tally_submissions')
    .update({ lead_id: newLead.id as string })
    .eq('id', sub.id as string)

  return NextResponse.json({ ok: true, submission_id: sub.id, lead_id: newLead.id, action: 'created' })
}
