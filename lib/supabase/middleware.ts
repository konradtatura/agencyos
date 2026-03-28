import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRoleFromUser, roleHome, PROTECTED_PREFIXES } from '@/lib/auth'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // ⚠️  No logic between createServerClient and getUser — required by @supabase/ssr.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!user) {
    if (isProtected) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const role = getRoleFromUser(user)

  function redirect(path: string) {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.searchParams.delete('next')
    return NextResponse.redirect(url)
  }

  // Bounce away from /login if already authenticated.
  if (pathname === '/login') return redirect(roleHome(role))

  // /admin — super_admin only.
  if (pathname.startsWith('/admin') && role !== 'super_admin') {
    return redirect(roleHome(role))
  }

  // /setter/* — setter (or super_admin impersonating) only.
  if (pathname.startsWith('/setter') && role !== 'setter' && role !== 'super_admin') {
    return redirect(roleHome(role))
  }

  // /closer/* — closer (or super_admin impersonating) only.
  if (pathname.startsWith('/closer') && role !== 'closer' && role !== 'super_admin') {
    return redirect(roleHome(role))
  }

  // /dashboard/* — creator (or super_admin) only.
  // Setters and closers have their own namespaces.
  if (pathname.startsWith('/dashboard') && role === 'setter') return redirect('/setter/dms')
  if (pathname.startsWith('/dashboard') && role === 'closer') return redirect('/closer/crm')

  // Creators must complete onboarding before accessing the dashboard.
  if (role === 'creator' && (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding'))) {
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('onboarding_complete')
      .eq('user_id', user.id)
      .single()

    const complete = profile?.onboarding_complete ?? false

    if (!complete && pathname.startsWith('/dashboard')) return redirect('/onboarding')
    if (complete && pathname.startsWith('/onboarding'))  return redirect('/dashboard')
  }

  return supabaseResponse
}
