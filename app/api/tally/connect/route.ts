/**
 * POST /api/tally/connect
 * Body: { api_key: string }
 *
 * Validates the key against the Tally API, then encrypts and stores it for
 * the calling creator.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tallyEncrypt } from '@/lib/tally/encryption'

interface TallyForm {
  id: string
  name: string
  workspaceName?: string
}

interface TallyFormsResponse {
  forms?: TallyForm[]
  data?: { forms?: TallyForm[] }
}

export async function POST(req: Request) {
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

  // -- Parse body --
  let apiKey: string
  try {
    const body = await req.json() as { api_key?: string }
    apiKey = (body.api_key ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 })
  }

  // -- Validate against Tally --
  let formCount = 0
  const workspaceSet = new Set<string>()

  try {
    const tallyRes = await fetch('https://api.tally.so/forms', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!tallyRes.ok) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 200 })
    }

    const json = (await tallyRes.json()) as TallyFormsResponse
    const forms: TallyForm[] = json.forms ?? json.data?.forms ?? []
    formCount = forms.length
    for (const f of forms) {
      if (f.workspaceName) workspaceSet.add(f.workspaceName)
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to reach Tally API' }, { status: 200 })
  }

  // -- Encrypt & upsert --
  const encryptedKey = tallyEncrypt(apiKey)

  const { error: upsertError } = await admin
    .from('tally_api_keys')
    .upsert(
      {
        creator_id:        profile.id,
        api_key_encrypted: encryptedKey,
        connected_at:      new Date().toISOString(),
        last_validated_at: new Date().toISOString(),
      },
      { onConflict: 'creator_id' },
    )

  if (upsertError) {
    console.error('[tally/connect] upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
  }

  return NextResponse.json({
    success:    true,
    form_count: formCount,
    workspaces: Array.from(workspaceSet),
  })
}
