/**
 * Shared auth helpers for CRM API routes.
 * All helpers use the admin client (RLS bypassed) and enforce access control
 * manually based on the user's role.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  let creatorId: string | null = null

  if (role === 'super_admin') {
    // If a super_admin is impersonating a creator, use that creator's ID.
    const cookieStore = await cookies()
    const impersonated = cookieStore.get('impersonating_creator_id')?.value
    if (impersonated) {
      creatorId = impersonated
      // Behave like a creator for data-scoping purposes
      return { admin, userId: user.id, role: 'creator', creatorId }
    }
  }

  if (role === 'creator') {
    const { data: profile } = await admin
      .from('creator_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return { error: NextResponse.json({ error: 'Creator profile not found' }, { status: 404 }) }
    }

    creatorId = profile.id as string
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
