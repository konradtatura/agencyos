import { NextResponse } from 'next/server'

const SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'instagram_manage_comments',
  'instagram_manage_messages',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',')

export async function GET() {
  const state = crypto.randomUUID()

  const params = new URLSearchParams({
    client_id:     process.env.META_APP_ID!,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`,
    scope:         SCOPES,
    response_type: 'code',
    state,
  })

  const fbUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params}`

  const response = NextResponse.redirect(fbUrl)
  response.cookies.set('ig_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600, // 10 minutes
    path:     '/',
  })

  return response
}
