import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/encryption'

const FB_API  = 'https://graph.facebook.com/v21.0'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

const log = {
  info:  (step: string, msg: string, data?: unknown) =>
    console.log( `[ig-callback] [${step}]`, msg, data !== undefined ? data : ''),
  error: (step: string, msg: string, data?: unknown) =>
    console.error(`[ig-callback] [${step}] ERROR:`, msg, data !== undefined ? data : ''),
}

function redirectError(code: string, onboarded = false) {
  const base = onboarded ? `${APP_URL}/dashboard/settings` : `${APP_URL}/onboarding`
  return NextResponse.redirect(`${base}?error=${code}`)
}

export async function GET(request: NextRequest) {
  log.info('init', 'Callback received', {
    url:        request.nextUrl.pathname,
    hasCode:    !!request.nextUrl.searchParams.get('code'),
    hasState:   !!request.nextUrl.searchParams.get('state'),
    hasError:   !!request.nextUrl.searchParams.get('error'),
    hasCookie:  !!request.cookies.get('ig_oauth_state'),
  })

  try {
    const { searchParams } = request.nextUrl
    const code  = searchParams.get('code')
    const state = searchParams.get('state')
    const fbErr = searchParams.get('error')

    // ── Facebook-returned error (user denied, etc.) ───────────────────────
    if (fbErr) {
      log.error('init', 'Facebook returned an error param', {
        error:             fbErr,
        error_reason:      searchParams.get('error_reason'),
        error_description: searchParams.get('error_description'),
      })
      return redirectError('instagram_denied')
    }

    // ── CSRF state check ──────────────────────────────────────────────────
    const storedState = request.cookies.get('ig_oauth_state')?.value
    log.info('csrf', 'State check', {
      receivedState: state,
      storedState:   storedState,
      match:         state === storedState,
    })
    if (!state || !storedState || state !== storedState) {
      log.error('csrf', 'State mismatch — possible CSRF or expired cookie')
      return redirectError('invalid_state')
    }

    if (!code) {
      log.error('init', 'No code param present')
      return redirectError('no_code')
    }

    // ── Auth check ────────────────────────────────────────────────────────
    log.info('auth', 'Verifying session')
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      log.error('auth', 'getUser() failed', authError)
      return NextResponse.redirect(`${APP_URL}/login`)
    }
    if (!user) {
      log.error('auth', 'No authenticated user found')
      return NextResponse.redirect(`${APP_URL}/login`)
    }
    log.info('auth', 'User verified', { userId: user.id })

    // ── Step 1: exchange code for short-lived token ───────────────────────
    log.info('step1', 'Exchanging code for short-lived token')
    let shortToken: string

    try {
      const shortTokenBody = new URLSearchParams({
        client_id:     process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri:  `${APP_URL}/api/instagram/callback`,
        code,
      })

      const res = await fetch(`${FB_API}/oauth/access_token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    shortTokenBody,
      })

      const body = await res.text()
      log.info('step1', `Response status: ${res.status}`)

      if (!res.ok) {
        log.error('step1', 'Short-lived token exchange failed', body)
        return redirectError('token_exchange_failed')
      }

      const parsed = JSON.parse(body) as { access_token?: string; error?: unknown }
      if (!parsed.access_token) {
        log.error('step1', 'Response OK but no access_token in body', parsed)
        return redirectError('token_exchange_failed')
      }

      shortToken = parsed.access_token
      log.info('step1', 'Short-lived token obtained')
    } catch (err) {
      log.error('step1', 'Unexpected exception', err)
      return redirectError('token_exchange_failed')
    }

    // ── Step 2: exchange for long-lived token (60 days) ───────────────────
    log.info('step2', 'Exchanging for long-lived token')
    let longToken: string
    let expiresAt: string

    try {
      const longTokenParams = new URLSearchParams({
        grant_type:        'fb_exchange_token',
        client_id:         process.env.META_APP_ID!,
        client_secret:     process.env.META_APP_SECRET!,
        fb_exchange_token: shortToken,
      })

      const res = await fetch(`${FB_API}/oauth/access_token?${longTokenParams}`)
      const body = await res.text()
      log.info('step2', `Response status: ${res.status}`)

      if (!res.ok) {
        log.error('step2', 'Long-lived token exchange failed', body)
        return redirectError('long_token_failed')
      }

      const parsed = JSON.parse(body) as {
        access_token?: string
        expires_in?:   number
        error?:        unknown
      }

      if (!parsed.access_token) {
        log.error('step2', 'Response OK but no access_token in body', parsed)
        return redirectError('long_token_failed')
      }

      longToken = parsed.access_token
      expiresAt = new Date(Date.now() + (parsed.expires_in ?? 5184000) * 1000).toISOString()
      log.info('step2', 'Long-lived token obtained', { expiresAt })
    } catch (err) {
      log.error('step2', 'Unexpected exception', err)
      return redirectError('long_token_failed')
    }

    // ── Step 3: fetch linked Facebook Pages ───────────────────────────────
    log.info('step3', 'Fetching /me/accounts (Facebook Pages)')
    let pages: Array<{ id: string; access_token: string; name: string }>

    try {
      const res  = await fetch(`${FB_API}/me/accounts?access_token=${longToken}`)
      const body = await res.text()
      log.info('step3', `Response status: ${res.status}`)

      if (!res.ok) {
        log.error('step3', 'Pages fetch failed', body)
        return redirectError('pages_failed')
      }

      const parsed = JSON.parse(body) as {
        data?:  Array<{ id: string; access_token: string; name: string }>
        error?: unknown
      }

      log.info('step3', `Pages found: ${parsed.data?.length ?? 0}`,
        parsed.data?.map(p => ({ id: p.id, name: p.name })))

      if (!parsed.data?.length) {
        log.error('step3', 'No Facebook Pages on this account')
        return redirectError('no_pages')
      }

      pages = parsed.data
    } catch (err) {
      log.error('step3', 'Unexpected exception', err)
      return redirectError('pages_failed')
    }

    // ── Step 4: find Instagram Business Account linked to a Page ──────────
    log.info('step4', 'Looking for Instagram Business Account on each Page')
    let igUserId:        string | null = null
    let igUsername:      string | null = null
    let pageAccessToken: string        = longToken

    try {
      for (const page of pages) {
        log.info('step4', `Checking page: ${page.name} (${page.id})`)

        const res  = await fetch(
          `${FB_API}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        )
        const body = await res.text()

        if (!res.ok) {
          log.error('step4', `Page ${page.id} fetch failed`, body)
          continue
        }

        const parsed = JSON.parse(body) as {
          instagram_business_account?: { id: string }
        }

        log.info('step4', `Page ${page.id} result`, parsed)

        if (parsed.instagram_business_account?.id) {
          igUserId        = parsed.instagram_business_account.id
          pageAccessToken = page.access_token
          log.info('step4', `Found IG Business Account: ${igUserId} via page ${page.name}`)
          break
        }
      }

      if (!igUserId) {
        log.error('step4', 'No Instagram Business Account found on any linked Page')
        return redirectError('no_instagram')
      }
    } catch (err) {
      log.error('step4', 'Unexpected exception', err)
      return redirectError('no_instagram')
    }

    // ── Step 5: fetch Instagram username ──────────────────────────────────
    log.info('step5', `Fetching username for IG account ${igUserId}`)

    try {
      const res  = await fetch(
        `${FB_API}/${igUserId}?fields=username&access_token=${pageAccessToken}`
      )
      const body = await res.text()
      log.info('step5', `Response status: ${res.status}`, body)

      if (res.ok) {
        const parsed = JSON.parse(body) as { username?: string }
        igUsername = parsed.username ?? null
        log.info('step5', `Username: ${igUsername}`)
      } else {
        log.error('step5', 'Username fetch failed (non-fatal)', body)
      }
    } catch (err) {
      log.error('step5', 'Unexpected exception (non-fatal)', err)
    }

    // ── Step 6: look up creator profile ───────────────────────────────────
    log.info('step6', 'Looking up creator profile', { userId: user.id })
    const admin = createAdminClient()

    const { data: profile, error: profileError } = await admin
      .from('creator_profiles')
      .select('id, onboarding_complete')
      .eq('user_id', user.id)
      .single()

    if (profileError) {
      log.error('step6', 'creator_profiles query error', profileError)
      return redirectError('no_profile')
    }
    if (!profile) {
      log.error('step6', 'No creator_profile row found for user', { userId: user.id })
      return redirectError('no_profile')
    }
    log.info('step6', 'Creator profile found', {
      profileId:          profile.id,
      onboardingComplete: profile.onboarding_complete,
    })

    // ── Step 7: encrypt token and upsert integration ───────────────────────
    log.info('step7', 'Encrypting token and upserting integration row')

    let encryptedToken: string
    try {
      encryptedToken = encrypt(longToken)
      log.info('step7', 'Token encrypted successfully')
    } catch (err) {
      log.error('step7', 'Encryption failed — check ENCRYPTION_KEY env var', err)
      return errorRedirect('save_failed', profile.onboarding_complete)
    }

    const { error: upsertError } = await admin.from('integrations').upsert(
      {
        creator_id:   profile.id,
        platform:     'instagram',
        access_token: encryptedToken,
        expires_at:   expiresAt,
        status:       'active',
        meta: { ig_user_id: igUserId, username: igUsername },
      },
      { onConflict: 'creator_id,platform' }
    )

    if (upsertError) {
      log.error('step7', 'Integration upsert failed', upsertError)
      return errorRedirect('save_failed', profile.onboarding_complete)
    }
    log.info('step7', 'Integration row saved')

    // ── Step 8: advance onboarding step ───────────────────────────────────
    if (!profile.onboarding_complete) {
      log.info('step8', 'Advancing onboarding_step to 3')
      const { error: stepError } = await admin
        .from('creator_profiles')
        .update({ onboarding_step: 3 })
        .eq('id', profile.id)

      if (stepError) {
        log.error('step8', 'Failed to advance onboarding step (non-fatal)', stepError)
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────
    const destination = profile.onboarding_complete
      ? `${APP_URL}/dashboard/settings?instagram=connected`
      : `${APP_URL}/onboarding`

    log.info('done', `Redirecting to ${destination}`)

    const response = NextResponse.redirect(destination)
    response.cookies.delete('ig_oauth_state')
    return response

  } catch (err) {
    // Catch-all: log the full error so nothing is swallowed silently.
    console.error('[ig-callback] [unhandled] Unhandled exception in callback handler:', err)
    return NextResponse.redirect(`${APP_URL}/onboarding?error=unexpected`)
  }
}

// Separate named export keeps the helper outside the try/catch scope.
function errorRedirect(code: string, onboarded = false) {
  const base = onboarded ? `${APP_URL}/dashboard/settings` : `${APP_URL}/onboarding`
  return NextResponse.redirect(`${base}?error=${code}`)
}
