/**
 * PATCH /api/tally/forms/[formId]
 *
 * Updates mutable fields on a tally_form row owned by the calling creator.
 * Currently used to toggle is_qualification_form.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

interface Params {
  params: { formId: string }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { admin, creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })

  let body: { is_qualification_form?: boolean }
  try {
    body = await req.json() as { is_qualification_form?: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.is_qualification_form === 'boolean') {
    patch.is_qualification_form = body.is_qualification_form
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('tally_forms')
    .update(patch)
    .eq('id', params.formId)
    .eq('creator_id', creatorId)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
