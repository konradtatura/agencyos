import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRoleFromUser, roleHome } from '@/lib/auth'

/**
 * Root route — immediately redirects to the user's role home,
 * or to /login if no session exists.
 *
 * This page renders no UI; it is purely a routing entry point.
 * The actual middleware handles subsequent requests, but this covers
 * the direct "/" hit before middleware fires.
 */
export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = getRoleFromUser(user)
  redirect(roleHome(role))
}
