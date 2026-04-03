/**
 * POST /api/tally/sync
 *
 * Agency-wide sync: pulls ALL forms and submissions from Tally using the
 * agency-level API key. Creator assignment on existing forms is preserved.
 * Saves questions array + completion counts for funnel analytics.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAgencyTallyKey } from '@/lib/tally/agencyKey'
import { mapTallySubmission, mapTallyResponses, type TallyField } from '@/lib/tally/mapFields'

interface TallyFormItem {
  id: string
  name?: string
  workspaceName?: string
  workspace?: { name?: string }
}

interface TallyQuestion {
  id:               string
  title?:           string
  type?:            string
  numberOfResponses?: number
}

interface TallySubmissionCounts {
  all?:       number
  completed?: number
  partial?:   number
}

interface TallySubmissionsResponse {
  submissions?:                         unknown[]
  questions?:                           TallyQuestion[]
  totalNumberOfSubmissionsPerFilter?:   TallySubmissionCounts
  data?: {
    submissions?: unknown[]
    questions?:   TallyQuestion[]
    totalNumberOfSubmissionsPerFilter?: TallySubmissionCounts
  }
}

interface TallySubmissionItem {
  id:           string
  submittedAt?: string
  createdAt?:   string
  isCompleted?: boolean
  fields?:      TallyField[]
  responses?:   Record<string, { value?: unknown }>
}

async function tallyFetch(url: string, apiKey: string): Promise<unknown> {
  console.log('[tally/sync] GET', url)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })

  const text = await res.text()
  console.log(`[tally/sync] ${url} → HTTP ${res.status}, body (first 600 chars):`, text.slice(0, 600))

  if (!res.ok) {
    throw Object.assign(
      new Error(`Tally API error ${res.status}: ${text.slice(0, 200)}`),
      { status: res.status },
    )
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Tally returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
}

function extractForms(json: unknown): TallyFormItem[] {
  if (!json || typeof json !== 'object') return []
  const j = json as Record<string, unknown>
  if (Array.isArray(j)) return j as TallyFormItem[]

  const candidates = [
    j.forms,
    j.items,
    (j.data as Record<string, unknown> | undefined)?.forms,
    (j.data as Record<string, unknown> | undefined)?.items,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as TallyFormItem[]
  }
  // Last resort — no array-scan fallback that could grab the wrong array
  return []
}

// Extract submissions explicitly from .submissions key only.
// The response also contains a `questions` array — any "first array wins"
// fallback would grab that instead and produce {"undefined": null} answers.
function extractSubmissions(json: unknown): TallySubmissionItem[] {
  if (!json || typeof json !== 'object') return []
  const j = json as Record<string, unknown>
  if (Array.isArray(j)) return j as TallySubmissionItem[]

  const explicit = j.submissions ?? (j.data as Record<string, unknown> | undefined)?.submissions
  if (Array.isArray(explicit)) return explicit as TallySubmissionItem[]

  console.warn('[tally/sync] extractSubmissions: no .submissions key. Top-level keys:', Object.keys(j))
  return []
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[tally/sync] triggered by user:', user.id)

  const apiKey = await getAgencyTallyKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Tally API key not configured — save it in Admin → Settings first' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // Fetch all forms
  let formsJson: unknown
  try {
    formsJson = await tallyFetch('https://api.tally.so/forms', apiKey)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    if (e?.status === 401) {
      return NextResponse.json(
        { error: 'Tally API key rejected (401) — rotate it in Admin → Settings' },
        { status: 401 },
      )
    }
    return NextResponse.json(
      { error: `Failed to fetch forms from Tally: ${e?.message ?? 'unknown error'}` },
      { status: 502 },
    )
  }

  const remoteForms = extractForms(formsJson)
  console.log('[tally/sync] parsed form count:', remoteForms.length)

  if (remoteForms.length === 0) {
    console.warn('[tally/sync] 0 forms. Response keys:', Object.keys(formsJson as object))
    return NextResponse.json({
      forms: 0, submissions: 0,
      warning: 'Tally returned 0 forms. Check Railway logs for the raw Tally response.',
    })
  }

  // Preserve creator_id + is_qualification_form on upsert
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
    console.log(`[tally/sync] processing form id=${form.id} name="${form.name ?? '?'}"`)

    let submissions: TallySubmissionItem[] = []
    let questions:   TallyQuestion[]       = []
    let counts:      TallySubmissionCounts = {}

    try {
      const subJson = await tallyFetch(
        `https://api.tally.so/forms/${form.id}/submissions`,
        apiKey,
      ) as TallySubmissionsResponse

      submissions = extractSubmissions(subJson)
      questions   = subJson.questions ?? subJson.data?.questions ?? []
      counts      = subJson.totalNumberOfSubmissionsPerFilter
                    ?? subJson.data?.totalNumberOfSubmissionsPerFilter
                    ?? {}

      console.log(
        `[tally/sync] form ${form.id}:`,
        `submissions=${submissions.length}`,
        `questions=${questions.length}`,
        `counts=`, JSON.stringify(counts),
      )
    } catch (err) {
      console.warn(`[tally/sync] failed to fetch submissions for form ${form.id}:`, (err as Error).message)
    }

    // Log submission shape for debugging
    if (submissions[0]) {
      const s0 = submissions[0]
      if (s0.responses) {
        const entries = Object.entries(s0.responses)
        console.log(`[tally/sync] sample responses (first 3):`, JSON.stringify(entries.slice(0, 3)))
      } else if (s0.fields?.[0]) {
        console.log(`[tally/sync] sample field (legacy):`, JSON.stringify(s0.fields[0]))
      } else {
        console.warn(`[tally/sync] submission has neither .responses nor .fields. Full first submission:`, JSON.stringify(s0))
      }
    }

    // Build questionId → title map for responses-based parsing
    const questionMap = new Map<string, string>(
      questions.map((q) => [q.id, q.title ?? q.id]),
    )

    const existing     = existingMap.get(form.id)
    const workspaceName = form.workspaceName ?? form.workspace?.name ?? null

    // creator_id intentionally omitted — preserved by ON CONFLICT, not overwritten
    const { error: upsertErr } = await admin.from('tally_forms').upsert(
      {
        tally_form_id:          form.id,
        name:                   form.name ?? null,
        workspace_name:         workspaceName,
        is_qualification_form:  existing?.isQual ?? false,
        total_submissions:      counts.all      ?? submissions.length,
        completed_submissions:  counts.completed ?? 0,
        partial_submissions:    counts.partial   ?? 0,
        questions:              questions.length > 0 ? questions : null,
        last_synced_at:         now,
        active:                 true,
      },
      { onConflict: 'tally_form_id' },
    )

    if (upsertErr) {
      console.error(`[tally/sync] form upsert error for ${form.id}:`, upsertErr.message)
    }

    if (!submissions.length) continue

    const { data: formRow } = await admin
      .from('tally_forms')
      .select('id, creator_id')
      .eq('tally_form_id', form.id)
      .single()

    if (!formRow) {
      console.warn(`[tally/sync] missing formRow after upsert for tally_form_id=${form.id}`)
      continue
    }

    const rows = submissions.map((s) => {
      let mapped
      if (s.responses && Object.keys(s.responses).length > 0) {
        mapped = mapTallyResponses(s.responses, questionMap)
      } else if (s.fields && s.fields.length > 0) {
        mapped = mapTallySubmission(s.fields)
      } else {
        mapped = { name: null, phone: null, ig: null, answers: {} as Record<string, unknown> }
      }
      const { name, phone, ig, answers } = mapped
      return {
        form_id:               formRow.id as string,
        tally_submission_id:   s.id,
        is_completed:          s.isCompleted ?? null,
        answers,
        respondent_name:       name,
        respondent_phone:      phone,
        respondent_ig_handle:  ig,
        submitted_at:          s.submittedAt ?? s.createdAt ?? null,
      }
    })

    const { error: subUpsertErr } = await admin
      .from('tally_submissions')
      .upsert(rows, { onConflict: 'tally_submission_id' })

    if (subUpsertErr) {
      console.error(`[tally/sync] submissions upsert error for form ${form.id}:`, subUpsertErr.message)
    }

    totalSubmissions += submissions.length
  }

  console.log(`[tally/sync] done — ${remoteForms.length} forms, ${totalSubmissions} submissions`)
  return NextResponse.json({ forms: remoteForms.length, submissions: totalSubmissions })
}
