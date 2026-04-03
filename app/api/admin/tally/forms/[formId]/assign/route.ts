/**
 * PATCH /api/admin/tally/forms/[formId]/assign
 *
 * Assigns (or unassigns) a tally_form to a creator.
 * Body: { creator_id: string | null }
 * Super-admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Params {
  params: { formId: string }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { creator_id?: string | null }
  try {
    body = await req.json() as { creator_id?: string | null }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  const newCreatorId = body.creator_id ?? null

  const { data, error } = await admin
    .from('tally_forms')
    .update({ creator_id: newCreatorId })
    .eq('id', params.formId)
    .select('id, name, creator_id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Form not found' }, { status: 404 })
  }

  // Backfill all existing submissions for this form with the new creator_id.
  // Submissions are synced with creator_id = null; this makes them visible
  // to the creator immediately after assignment without waiting for a re-sync.
  const { error: subError } = await admin
    .from('tally_submissions')
    .update({ creator_id: newCreatorId })
    .eq('form_id', params.formId)

  if (subError) {
    console.error('[assign] submissions backfill error:', subError.message)
  }

  return NextResponse.json(data)
}
