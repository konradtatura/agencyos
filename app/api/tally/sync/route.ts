/**
 * POST /api/tally/sync
 *
 * Agency-wide sync: pulls ALL forms and submissions from Tally using the
 * agency-level API key. Creator assignment on existing forms is preserved.
 * Can be called by super_admin or any authenticated creator (used by the
 * Sync Now button — but only pulls data; creator sees only their assignments).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAgencyTallyKey } from '@/lib/tally/agencyKey'
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
  createdAt?:   string
  fields?:      TallyField[]
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
    throw Object.assign(new Error(`Tally API error ${res.status}`), { status: res.status })
  }
  return res.json() as Promise<T>
}

export async function POST() {
  // -- Auth: any authenticated user may trigger a sync --
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // -- Load agency key --
  const apiKey = await getAgencyTallyKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'Tally API key not configured — contact your admin' }, { status: 400 })
  }

  const admin = createAdminClient()

  // -- Fetch all forms --
  let remoteForms: TallyFormItem[]
  try {
    const json = await tallyFetch<TallyFormsResponse>('https://api.tally.so/forms', apiKey)
    remoteForms = json.forms ?? json.data?.forms ?? []
  } catch (err: unknown) {
    const e = err as { status?: number }
    if (e?.status === 401) {
      return NextResponse.json({ error: 'Tally API key expired — contact your admin' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch forms from Tally' }, { status: 502 })
  }

  // Load existing forms to preserve creator_id + is_qualification_form on upsert
  const { data: existingForms } = await admin
    .from('tally_forms')
    .select('tally_form_id, creator_id, is_qualification_form')

  const existingMap = new Map(
    (existingForms ?? []).map((f) => [
      f.tally_form_id as string,
      { creatorId: f.creator_id as string | null, isQual: f.is_qualification_form as boolean },
    ]),
  )

  const now = new Date().toISOString()
  let totalSubmissions = 0

  for (const form of remoteForms) {
    let submissions: TallySubmissionItem[] = []
    let submissionCount = 0

    try {
      const json = await tallyFetch<TallySubmissionsResponse>(
        `https://api.tally.so/forms/${form.id}/submissions`,
        apiKey,
      )
      submissions = json.submissions ?? json.data?.submissions ?? []
      submissionCount = submissions.length
    } catch {
      console.warn(`[tally/sync] failed to fetch submissions for form ${form.id}`)
    }

    const existing = existingMap.get(form.id)

    // Upsert form — preserve creator_id and is_qualification_form
    await admin.from('tally_forms').upsert(
      {
        // creator_id is intentionally omitted from the upsert value so that
        // on conflict the existing value is NOT overwritten; we set it only
        // for new rows (where existing is undefined).
        creator_id:           existing?.creatorId ?? null,
        tally_form_id:        form.id,
        name:                 form.name ?? null,
        workspace_name:       form.workspaceName ?? null,
        is_qualification_form: existing?.isQual ?? false,
        total_submissions:    submissionCount,
        last_synced_at:       now,
        active:               true,
      },
      { onConflict: 'tally_form_id' },
    )

    if (!submissions.length) continue

    // Resolve the internal form UUID
    const { data: formRow } = await admin
      .from('tally_forms')
      .select('id, creator_id')
      .eq('tally_form_id', form.id)
      .single()

    if (!formRow) continue

    const formCreatorId = formRow.creator_id as string | null

    // Upsert submissions
    const rows = submissions.map((s) => {
      const { name, phone, ig, answers } = mapTallySubmission(s.fields ?? [])
      return {
        creator_id:           formCreatorId,
        form_id:              formRow.id as string,
        tally_submission_id:  s.id,
        answers,
        respondent_name:      name,
        respondent_phone:     phone,
        respondent_ig_handle: ig,
        submitted_at:         s.submittedAt ?? s.createdAt ?? null,
      }
    })

    await admin
      .from('tally_submissions')
      .upsert(rows, { onConflict: 'tally_submission_id' })

    totalSubmissions += submissions.length
  }

  return NextResponse.json({ forms: remoteForms.length, submissions: totalSubmissions })
}
