/**
 * GET /api/tally/forms
 *
 * Returns tally_forms assigned to the calling creator.
 * No "connected" check — the agency key is managed by admin.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

export async function GET() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { admin, creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })

  const { data: forms } = await admin
    .from('tally_forms')
    .select('id, tally_form_id, name, workspace_name, total_submissions, last_synced_at, is_qualification_form, active')
    .eq('creator_id', creatorId)
    .eq('active', true)
    .order('name', { ascending: true })

  const lastSynced = (forms ?? []).reduce<string | null>((latest, f) => {
    const t = f.last_synced_at as string | null
    if (!t) return latest
    if (!latest) return t
    return t > latest ? t : latest
  }, null)

  return NextResponse.json({ forms: forms ?? [], last_synced_at: lastSynced })
}
