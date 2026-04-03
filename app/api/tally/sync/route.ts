/**
 * POST /api/tally/sync
 *
 * Pulls all forms and submissions from Tally for the calling creator and
 * upserts them into tally_forms / tally_submissions.
 * Preserves is_qualification_form when upserting forms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tallyDecrypt } from '@/lib/tally/encryption'
import { mapTallySubmission, type TallyField } from '@/lib/tally/mapFields'

interface TallyFormItem {
  id: string
  name?: string
  workspaceName?: string
}

interface TallyFormsResponse {
  forms?: TallyFormItem[]
  data?: { forms?: TallyFormItem[] }
}

interface TallySubmissionItem {
  id: string
  submittedAt?: string
  createdAt?: string
  fields?: TallyField[]
}

interface TallySubmissionsResponse {
  submissions?: TallySubmissionItem[]
  data?: { submissions?: TallySubmissionItem[] }
}

async function tallyFetch<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`Tally API error ${res.status}`), { status: res.status, body: text })
  }
  return res.json() as Promise<T>
}

export async function POST() {
  // -- Auth --
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

  // -- Load & decrypt API key --
  const { data: keyRow } = await admin
    .from('tally_api_keys')
    .select('api_key_encrypted')
    .eq('creator_id', creatorId)
    .single()

  if (!keyRow) {
    return NextResponse.json({ error: 'Tally not connected' }, { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = tallyDecrypt(keyRow.api_key_encrypted)
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt API key' }, { status: 500 })
  }

  // -- Fetch forms --
  let remoteForms: TallyFormItem[]
  try {
    const json = await tallyFetch<TallyFormsResponse>('https://api.tally.so/forms', apiKey)
    remoteForms = json.forms ?? json.data?.forms ?? []
  } catch (err: unknown) {
    const e = err as { status?: number }
    if (e?.status === 401) {
      return NextResponse.json({ error: 'API key expired — reconnect Tally' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch forms from Tally' }, { status: 502 })
  }

  // -- Load existing forms to preserve is_qualification_form --
  const { data: existingForms } = await admin
    .from('tally_forms')
    .select('tally_form_id, is_qualification_form')
    .eq('creator_id', creatorId)

  const qualMap = new Map<string, boolean>(
    (existingForms ?? []).map((f) => [f.tally_form_id as string, f.is_qualification_form as boolean]),
  )

  // -- Upsert forms --
  const now = new Date().toISOString()
  let totalSubmissions = 0

  for (const form of remoteForms) {
    // Count submissions for this form
    let submissionCount = 0
    let submissions: TallySubmissionItem[] = []

    try {
      const json = await tallyFetch<TallySubmissionsResponse>(
        `https://api.tally.so/forms/${form.id}/submissions`,
        apiKey,
      )
      submissions = json.submissions ?? json.data?.submissions ?? []
      submissionCount = submissions.length
    } catch {
      // Non-fatal — skip submissions for this form on error
      console.warn(`[tally/sync] failed to fetch submissions for form ${form.id}`)
    }

    // Upsert form row
    await admin.from('tally_forms').upsert(
      {
        creator_id:           creatorId,
        tally_form_id:        form.id,
        name:                 form.name ?? null,
        workspace_name:       form.workspaceName ?? null,
        is_qualification_form: qualMap.get(form.id) ?? false,
        total_submissions:    submissionCount,
        last_synced_at:       now,
        active:               true,
      },
      { onConflict: 'tally_form_id' },
    )

    // Get the tally_forms.id for FK on submissions
    const { data: formRow } = await admin
      .from('tally_forms')
      .select('id')
      .eq('tally_form_id', form.id)
      .single()

    if (!formRow || !submissions.length) continue

    // Upsert submissions
    const submissionRows = submissions.map((s) => {
      const fields = s.fields ?? []
      const { name, phone, ig, answers } = mapTallySubmission(fields)

      return {
        creator_id:          creatorId,
        form_id:             formRow.id as string,
        tally_submission_id: s.id,
        answers,
        respondent_name:     name,
        respondent_phone:    phone,
        respondent_ig_handle: ig,
        submitted_at:        s.submittedAt ?? s.createdAt ?? null,
      }
    })

    await admin
      .from('tally_submissions')
      .upsert(submissionRows, { onConflict: 'tally_submission_id' })

    totalSubmissions += submissions.length
  }

  return NextResponse.json({ forms: remoteForms.length, submissions: totalSubmissions })
}
