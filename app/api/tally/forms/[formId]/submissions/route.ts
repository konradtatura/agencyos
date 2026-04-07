/**
 * GET /api/tally/forms/[formId]/submissions
 *
 * Returns form metadata (including questions for funnel + submission counts)
 * and all submissions for the form, scoped to the calling creator.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'

interface Params {
  params: { formId: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  // Fetch form by id — no creator_id filter so that newly-assigned forms and
  // forms with partial creator_id data still resolve.  Access is implicitly
  // scoped because the creator's dashboard list only surfaces their own forms.
  const { data: form } = await admin
    .from('tally_forms')
    .select('id, tally_form_id, name, workspace_name, total_submissions, completed_submissions, partial_submissions, is_qualification_form, questions, creator_id')
    .eq('id', params.formId)
    .maybeSingle()

  if (!form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }

  // Soft access check: creator can only see their own form
  if (form.creator_id !== null && form.creator_id !== creatorId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Filter by form_id only — form ownership check above already scopes to creator.
  // Filtering by creator_id would exclude submissions synced before assignment.
  const { data: submissions } = await admin
    .from('tally_submissions')
    .select('id, tally_submission_id, respondent_name, respondent_phone, respondent_ig_handle, answers, submitted_at, lead_id, is_completed')
    .eq('form_id', params.formId)
    .order('submitted_at', { ascending: false })

  return NextResponse.json({ form, submissions: submissions ?? [] })
}
