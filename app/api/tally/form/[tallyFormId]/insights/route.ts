/**
 * GET /api/tally/form/[tallyFormId]/insights
 *
 * Fetches live funnel data directly from Tally API — questions with
 * numberOfResponses and totalNumberOfSubmissionsPerFilter counts.
 * Response is cached for 5 minutes at the Next.js fetch layer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAgencyTallyKey } from '@/lib/tally/agencyKey'

interface Params {
  params: { tallyFormId: string }
}

interface TallyInsightsResponse {
  questions?:                          { id: string; title?: string; type?: string; numberOfResponses?: number }[]
  totalNumberOfSubmissionsPerFilter?:  { all?: number; completed?: number; partial?: number }
  data?: {
    questions?:                         { id: string; title?: string; type?: string; numberOfResponses?: number }[]
    totalNumberOfSubmissionsPerFilter?: { all?: number; completed?: number; partial?: number }
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = await getAgencyTallyKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'Tally API key not configured' }, { status: 400 })
  }

  let res: Response
  try {
    // limit=1 to minimise payload — questions and counts are top-level metadata
    res = await fetch(
      `https://api.tally.so/forms/${params.tallyFormId}/submissions?limit=1`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next:    { revalidate: 300 },   // cache 5 min
      },
    )
  } catch (err) {
    console.error('[tally/insights] fetch error:', (err as Error).message)
    return NextResponse.json({ error: 'Failed to reach Tally API' }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`[tally/insights] Tally returned ${res.status}:`, text.slice(0, 200))
    return NextResponse.json({ error: `Tally API error ${res.status}` }, { status: res.status })
  }

  const json = await res.json() as TallyInsightsResponse

  const questions = json.questions ?? json.data?.questions ?? []
  const raw       = json.totalNumberOfSubmissionsPerFilter ?? json.data?.totalNumberOfSubmissionsPerFilter ?? {}

  return NextResponse.json({
    questions,
    counts: {
      all:       raw.all       ?? 0,
      completed: raw.completed ?? 0,
      partial:   raw.partial   ?? 0,
    },
  })
}
