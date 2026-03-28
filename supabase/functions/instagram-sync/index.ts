/**
 * Supabase Edge Function: instagram-sync
 *
 * Triggered on a cron schedule (every 6 hours).
 * Calls the internal Next.js sync-all route which syncs all creators
 * that have an active Instagram integration.
 *
 * Required environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   APP_URL      — The deployed URL of your Next.js app (e.g. https://app.agencyos.com)
 *   CRON_SECRET  — A long random string shared with your Next.js CRON_SECRET env var
 *
 * Deno runtime — no npm imports. Uses native fetch.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

serve(async (_req: Request): Promise<Response> => {
  const appUrl    = Deno.env.get('APP_URL')
  const cronSecret = Deno.env.get('CRON_SECRET')

  if (!appUrl || !cronSecret) {
    const msg = 'Missing required env vars: APP_URL and/or CRON_SECRET'
    console.error('[instagram-sync]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const endpoint = `${appUrl}/api/internal/instagram/sync-all`
  console.log('[instagram-sync] Calling', endpoint)

  let result: unknown
  let status: number

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-cron-secret':  cronSecret,
      },
    })

    status = res.status
    result = await res.json()

    if (!res.ok) {
      console.error('[instagram-sync] sync-all returned', status, result)
    } else {
      console.log('[instagram-sync] sync-all succeeded', result)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[instagram-sync] Network error calling sync-all:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
