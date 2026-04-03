/**
 * GET /api/tally/forms
 *
 * Returns the calling creator's connected status + list of tally_forms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
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

  // Check connection
  const { data: keyRow } = await admin
    .from('tally_api_keys')
    .select('connected_at')
    .eq('creator_id', creatorId)
    .maybeSingle()

  if (!keyRow) {
    return NextResponse.json({ connected: false, forms: [], last_synced_at: null })
  }

  const { data: forms } = await admin
    .from('tally_forms')
    .select('id, tally_form_id, name, workspace_name, total_submissions, last_synced_at, is_qualification_form, active')
    .eq('creator_id', creatorId)
    .eq('active', true)
    .order('name', { ascending: true })

  const lastSynced = forms && forms.length > 0
    ? forms.reduce<string | null>((latest, f) => {
        const t = f.last_synced_at as string | null
        if (!t) return latest
        if (!latest) return t
        return t > latest ? t : latest
      }, null)
    : null

  return NextResponse.json({ connected: true, forms: forms ?? [], last_synced_at: lastSynced })
}
