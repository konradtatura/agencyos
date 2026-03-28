import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRoleFromUser, roleHome } from '@/lib/auth'

/**
 * Handles the OAuth / magic-link code exchange from Supabase.
 *
 * Supabase redirects here with ?code=... after the user confirms their email
 * or completes an OAuth flow. We exchange the code for a session, then send
 * the user to their role-appropriate home (or the ?next= param if provided).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback_failed`
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  // Honour an explicit ?next= redirect (e.g. deep-link after forced login).
  // Only allow relative paths to prevent open-redirect attacks.
  if (next && next.startsWith('/')) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  const role = getRoleFromUser(user)
  return NextResponse.redirect(`${origin}${roleHome(role)}`)
}
