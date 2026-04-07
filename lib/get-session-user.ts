/**
 * Resolves the authenticated user along with their role and display name
 * from the public.users table — NOT from JWT app_metadata.
 *
 * This is the authoritative source for role because accounts created manually
 * in Supabase may not have app_metadata.role set.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRole, type Role } from '@/lib/auth'

export type SessionUser = {
  id:        string
  email:     string
  role:      Role
  full_name: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) return null

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  // If the users row doesn't exist yet, fall back to JWT metadata
  const rawRole = row?.role ?? user.app_metadata?.role ?? user.user_metadata?.role
  const role: Role = isRole(rawRole) ? rawRole : 'creator'

  return {
    id:        user.id,
    email:     user.email!,
    role,
    full_name: row?.full_name ?? (user.user_metadata?.full_name as string | null) ?? null,
  }
}
