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
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next')

  const supabase = await createClient()

  if (tokenHash && type) {
    // Invite / magic-link / recovery flow
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as Parameters<typeof supabase.auth.verifyOtp>[0]['type'],
    })
    if (error) {
      console.error('[auth/callback] verifyOtp error:', error.message)
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
    }
  } else if (code) {
    // OAuth / PKCE code flow
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message)
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
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
