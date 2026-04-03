/**
 * POST /api/tally/sync
 *
 * Agency-wide sync: pulls ALL forms and submissions from Tally using the
 * agency-level API key. Creator assignment on existing forms is preserved.
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
  workspace?: { name?: string }
}

interface TallySubmissionItem {
  id: string
  submittedAt?: string
  createdAt?:   string
  fields?:      TallyField[]
  responses?:   TallyField[]   // alternate key some Tally versions use
}

// Fetch a Tally endpoint and return the parsed JSON.
// Logs the full raw response so we can see the actual shape.
async function tallyFetch(url: string, apiKey: string): Promise<unknown> {
  console.log('[tally/sync] GET', url)

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // Prevent Next.js from caching API responses
    cache: 'no-store',
  })

  const text = await res.text()
  console.log(`[tally/sync] ${url} → HTTP ${res.status}, body (first 500 chars):`, text.slice(0, 500))

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

// Robustly extract the forms array from any Tally response shape
function extractForms(json: unknown): TallyFormItem[] {
  if (!json || typeof json !== 'object') return []
  const j = json as Record<string, unknown>

  // Direct array at root
  if (Array.isArray(j)) return j as TallyFormItem[]

  // Common shapes: { forms: [...] } or { data: { forms: [...] } } or { items: [...] }
  const candidates = [
    j.forms,
    j.items,
    (j.data as Record<string, unknown> | undefined)?.forms,
    (j.data as Record<string, unknown> | undefined)?.items,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as TallyFormItem[]
  }

  // Return any array-valued key as a last resort
  for (const val of Object.values(j)) {
    if (Array.isArray(val)) return val as TallyFormItem[]
  }

  return []
}

// Extract submissions from the Tally API response.
// The confirmed shape is: { page, limit, hasMore, questions: [...], submissions: [...] }
// We MUST read .submissions explicitly — the response also contains a `questions`
// array, so any "return the first array found" fallback would grab the wrong one.
function extractSubmissions(json: unknown): TallySubmissionItem[] {
  if (!json || typeof json !== 'object') return []
  const j = json as Record<string, unknown>

  // Root-level array (unusual but possible)
  if (Array.isArray(j)) return j as TallySubmissionItem[]

  // Primary: explicit named keys only — no fallback array scan
  const explicit = j.submissions ?? (j.data as Record<string, unknown> | undefined)?.submissions
  if (Array.isArray(explicit)) return explicit as TallySubmissionItem[]

  // Log if we couldn't find submissions so the shape shows up in Railway logs
  const keys = Object.keys(j)
  console.warn('[tally/sync] extractSubmissions: no .submissions key found. Top-level keys:', keys)
  return []
}

export async function POST() {
  // -- Auth --
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[tally/sync] triggered by user:', user.id)

  // -- Load agency key --
  const apiKey = await getAgencyTallyKey()
  if (!apiKey) {
    console.error('[tally/sync] no agency Tally key found')
    return NextResponse.json(
      { error: 'Tally API key not configured — save it in Admin → Settings first' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // -- Fetch all forms --
  let formsJson: unknown
  try {
    formsJson = await tallyFetch('https://api.tally.so/forms', apiKey)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    console.error('[tally/sync] forms fetch error:', e?.message)
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
    console.warn('[tally/sync] Tally returned 0 forms. Raw response keys:', Object.keys(formsJson as object))
    // Return 200 with diagnostic info so the frontend can show it
    return NextResponse.json({
      forms: 0,
      submissions: 0,
      warning: 'Tally returned 0 forms. Check Railway logs for the raw Tally response.',
    })
  }

  // -- Load existing forms to preserve creator_id + is_qualification_form --
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
    let submissionCount = 0

    try {
      const subJson = await tallyFetch(
        `https://api.tally.so/forms/${form.id}/submissions`,
        apiKey,
      )
      submissions = extractSubmissions(subJson)
      submissionCount = submissions.length
      console.log(`[tally/sync] form ${form.id}: ${submissionCount} submissions`)
    } catch (err) {
      console.warn(`[tally/sync] failed to fetch submissions for form ${form.id}:`, (err as Error).message)
    }

    const existing = existingMap.get(form.id)
    const workspaceName = form.workspaceName ?? form.workspace?.name ?? null

    // creator_id is intentionally omitted: new rows get null (default),
    // existing rows keep their current assignment untouched.
    const { error: upsertErr } = await admin.from('tally_forms').upsert(
      {
        tally_form_id:         form.id,
        name:                  form.name ?? null,
        workspace_name:        workspaceName,
        is_qualification_form: existing?.isQual ?? false,
        total_submissions:     submissionCount,
        last_synced_at:        now,
        active:                true,
      },
      { onConflict: 'tally_form_id' },
    )

    if (upsertErr) {
      console.error(`[tally/sync] upsert error for form ${form.id}:`, upsertErr.message)
    }

    if (!submissions.length) continue

    const { data: formRow } = await admin
      .from('tally_forms')
      .select('id, creator_id')
      .eq('tally_form_id', form.id)
      .single()

    if (!formRow) {
      console.warn(`[tally/sync] could not find formRow after upsert for tally_form_id=${form.id}`)
      continue
    }

    // Log the first submission's first field so we can verify the shape in Railway
    if (submissions[0]) {
      const sample = submissions[0]
      const sampleFields = sample.fields ?? []
      console.log(
        `[tally/sync] form ${form.id} sample submission id=${sample.id}`,
        `fields count=${sampleFields.length}`,
        `first field=`, JSON.stringify(sampleFields[0] ?? null),
      )
    }

    const rows = submissions.map((s) => {
      const fields = s.fields ?? []
      const { name, phone, ig, answers } = mapTallySubmission(fields)
      return {
        form_id:               formRow.id as string,
        tally_submission_id:   s.id,
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
