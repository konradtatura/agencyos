/**
 * Shared auth helpers for CRM API routes.
 * All helpers use the admin client (RLS bypassed) and enforce access control
 * manually based on the user's role.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCreatorId } from '@/lib/get-creator-id'
import type { Lead } from '@/types/crm'

export type CrmUser = {
  admin: ReturnType<typeof createAdminClient>
  userId: string
  role: string
  creatorId: string | null  // set only for 'creator' role
}

export type CrmUserResult = { error: NextResponse } | CrmUser

export type CrmLeadResult = { error: NextResponse } | (CrmUser & { lead: Lead })

/**
 * Authenticate the caller and resolve their role + creator profile.
 * Returns an error Response if unauthenticated or profile is missing.
 */
export async function resolveCrmUser(): Promise<CrmUserResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()

  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = userRow?.role ?? 'creator'

  // Resolve creator ID via shared helper — reads the impersonation header set by
  // middleware, so no cookie access is needed here.
  const creatorId = await getCreatorId()

  // If super_admin is impersonating, behave like that creator for data-scoping
  if (role === 'super_admin' && creatorId) {
    return { admin, userId: user.id, role: 'creator', creatorId }
  }

  // Regular creator must have a profile
  if (role === 'creator' && !creatorId) {
    return { error: NextResponse.json({ error: 'Creator profile not found' }, { status: 404 }) }
  }

  return { admin, userId: user.id, role, creatorId }
}

/**
 * Authenticate + verify the caller has access to the given lead.
 * Returns 404 if the lead doesn't exist, 403 if the user cannot access it.
 */
export async function resolveCrmLead(leadId: string): Promise<CrmLeadResult> {
  const authResult = await resolveCrmUser()
  if ('error' in authResult) return authResult

  const { admin, userId, role, creatorId } = authResult

  const { data: lead } = await admin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) {
    return { error: NextResponse.json({ error: 'Lead not found' }, { status: 404 }) }
  }

  const hasAccess =
    role === 'super_admin' ||
    (role === 'creator' && lead.creator_id === creatorId) ||
    (role === 'setter' && lead.assigned_setter_id === userId) ||
    (role === 'closer' && lead.assigned_closer_id === userId)

  if (!hasAccess) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, userId, role, creatorId, lead: lead as Lead }
}
