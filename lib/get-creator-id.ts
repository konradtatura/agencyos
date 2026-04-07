import { headers } from 'next/headers'
import { createAdminClient } from './supabase/admin'
import { createClient } from './supabase/server'

export async function getCreatorId(): Promise<string | null> {
  // Check impersonation header first (set by middleware when super_admin is impersonating)
  const h = await headers()
  const impersonating = h.get('x-impersonating-creator-id')
  if (impersonating) return impersonating

  // Otherwise use logged-in user's own profile
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('creator_profiles').select('id').eq('user_id', user.id).single()
  return data?.id ?? null
}
