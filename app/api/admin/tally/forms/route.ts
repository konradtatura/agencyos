/**
 * GET /api/admin/tally/forms
 *
 * Returns all tally_forms with their creator assignment.
 * Super-admin only.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const [{ data: forms }, { data: creators }] = await Promise.all([
    admin
      .from('tally_forms')
      .select('id, tally_form_id, name, workspace_name, total_submissions, last_synced_at, is_qualification_form, creator_id, active')
      .order('workspace_name', { ascending: true })
      .order('name', { ascending: true }),
    admin
      .from('creator_profiles')
      .select('id, name')
      .order('name', { ascending: true }),
  ])

  return NextResponse.json({ forms: forms ?? [], creators: creators ?? [] })
}
