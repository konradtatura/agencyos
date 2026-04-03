/**
 * POST /api/tally/submissions/[submissionId]/create-lead
 *
 * Manually triggers lead creation for a submission that didn't auto-create one
 * (e.g. form was not marked as qualification form at the time of submission).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Params {
  params: { submissionId: string }
}

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  const creatorId = profile.id as string

  // Load submission
  const { data: sub } = await admin
    .from('tally_submissions')
    .select('id, creator_id, form_id, respondent_name, respondent_phone, respondent_ig_handle, answers, lead_id')
    .eq('id', params.submissionId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!sub) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (sub.lead_id) {
    return NextResponse.json({ lead_id: sub.lead_id, action: 'already_exists' })
  }

  // Load form name for the note
  const { data: form } = await admin
    .from('tally_forms')
    .select('name')
    .eq('id', sub.form_id as string)
    .maybeSingle()

  const formName = (form?.name as string | null) ?? 'Unknown form'
  const answers  = (sub.answers as Record<string, unknown> | null) ?? {}

  const noteLines = Object.entries(answers)
    .map(([q, a]) => `${q}: ${a ?? '—'}`)
    .join('\n')
  const noteText = `Created from Tally form: ${formName}\n\n${noteLines}`

  // Search for existing lead
  const name  = sub.respondent_name  as string | null
  const phone = sub.respondent_phone as string | null
  const ig    = sub.respondent_ig_handle as string | null

  let leadId: string | null = null

  if (ig || phone) {
    const orParts: string[] = []
    if (ig)    orParts.push(`ig_handle.eq.${ig}`)
    if (phone) orParts.push(`phone.eq.${phone}`)

    const { data: existing } = await admin
      .from('leads')
      .select('id')
      .eq('creator_id', creatorId)
      .or(orParts.join(','))
      .maybeSingle()

    if (existing) leadId = existing.id as string
  }

  if (leadId) {
    await admin.from('lead_notes').insert({ lead_id: leadId, author_id: null, note_text: noteText })
  } else {
    const { data: newLead, error: leadErr } = await admin
      .from('leads')
      .insert({
        creator_id:      creatorId,
        name:            name ?? 'Unknown',
        ig_handle:       ig    ?? null,
        phone:           phone ?? null,
        stage:           'dmd',
        lead_source_type: 'organic',
        pipeline_type:   'main',
      })
      .select('id')
      .single()

    if (leadErr || !newLead) {
      return NextResponse.json({ error: leadErr?.message ?? 'Failed to create lead' }, { status: 500 })
    }

    leadId = newLead.id as string

    await admin.from('lead_stage_history').insert({
      lead_id: leadId, from_stage: null, to_stage: 'dmd', changed_by: null,
      note: `Created manually from Tally submission (form: ${formName})`,
    })
    await admin.from('lead_notes').insert({ lead_id: leadId, author_id: null, note_text: noteText })
  }

  // Link submission → lead
  await admin
    .from('tally_submissions')
    .update({ lead_id: leadId })
    .eq('id', params.submissionId)

  return NextResponse.json({ lead_id: leadId, action: leadId ? 'created' : 'linked' })
}
