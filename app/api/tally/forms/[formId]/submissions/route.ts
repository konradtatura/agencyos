/**
 * GET /api/tally/forms/[formId]/submissions
 *
 * Returns the form metadata + all submissions for a specific tally_form,
 * scoped to the calling creator.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Params {
  params: { formId: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
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

  // Verify form belongs to this creator
  const { data: form } = await admin
    .from('tally_forms')
    .select('id, name, workspace_name, total_submissions, is_qualification_form')
    .eq('id', params.formId)
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }

  // Filter by form_id only — the form ownership check above already scopes
  // access to this creator. Filtering by creator_id would exclude submissions
  // synced before the form was assigned (where creator_id is still null).
  const { data: submissions } = await admin
    .from('tally_submissions')
    .select('id, tally_submission_id, respondent_name, respondent_phone, respondent_ig_handle, answers, submitted_at, lead_id')
    .eq('form_id', params.formId)
    .order('submitted_at', { ascending: false })

  return NextResponse.json({ form, submissions: submissions ?? [] })
}
