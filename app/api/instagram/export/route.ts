/**
 * GET /api/instagram/export
 *
 * Returns a CSV file with Instagram analytics data:
 *  - KPI summary (7d and 30d)
 *  - Daily reach + net followers (up to 90 days)
 *  - Weekly posting cadence + new followers (12 weeks)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function row(...cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      const s = c == null ? '' : String(c)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    })
    .join(',')
}

function lines(...rows: string[]): string {
  return rows.join('\r\n')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) return new NextResponse('Creator profile not found', { status: 404 })

  // ── Fetch up to 90 days of snapshots ───────────────────────────────────────
  const { data: rawSnaps } = await admin
    .from('instagram_account_snapshots')
    .select([
      'date',
      'followers_count',
      'reach',
      'unfollows',
      'reach_7d',
      'reach_30d',
      'profile_views_7d',
      'profile_views_30d',
      'accounts_engaged_7d',
      'accounts_engaged_30d',
      'website_clicks_7d',
      'website_clicks_30d',
    ].join(', '))
    .eq('creator_id', profile.id)
    .order('date', { ascending: false })
    .limit(90)

  const snaps = (rawSnaps ?? []) as Array<{
    date: string
    followers_count:      number | null
    reach:                number | null
    unfollows:            number | null
    reach_7d:             number | null
    reach_30d:            number | null
    profile_views_7d:     number | null
    profile_views_30d:    number | null
    accounts_engaged_7d:  number | null
    accounts_engaged_30d: number | null
    website_clicks_7d:    number | null
    website_clicks_30d:   number | null
  }>

  const latest = snaps[0] ?? null

  // ── Fetch posts for cadence ────────────────────────────────────────────────
  const { data: posts } = await admin
    .from('instagram_posts')
    .select('posted_at')
    .eq('creator_id', profile.id)
    .order('posted_at', { ascending: false })

  // ── Build weekly cadence buckets (12 weeks, oldest → newest) ──────────────
  const now = new Date()
  const todayDow = now.getUTCDay()
  const daysToMonday = todayDow === 0 ? 6 : todayDow - 1
  const thisMonday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday,
  ))

  const cadenceMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisMonday)
    d.setUTCDate(thisMonday.getUTCDate() - i * 7)
    cadenceMap.set(d.toISOString().split('T')[0], 0)
  }

  for (const post of posts ?? []) {
    const d = new Date(post.posted_at)
    const pdow = d.getUTCDay()
    const pToMonday = pdow === 0 ? 6 : pdow - 1
    d.setUTCDate(d.getUTCDate() - pToMonday)
    d.setUTCHours(0, 0, 0, 0)
    const key = d.toISOString().split('T')[0]
    if (cadenceMap.has(key)) cadenceMap.set(key, cadenceMap.get(key)! + 1)
  }

  // Weekly new followers from snapshot deltas
  const followersByWeek = new Map<string, number>()
  for (const snap of snaps) {
    if (snap.followers_count == null) continue
    const d = new Date(snap.date + 'T00:00:00Z')
    const sdow = d.getUTCDay()
    const sToMonday = sdow === 0 ? 6 : sdow - 1
    d.setUTCDate(d.getUTCDate() - sToMonday)
    const key = d.toISOString().split('T')[0]
    if (cadenceMap.has(key)) {
      followersByWeek.set(key, (followersByWeek.get(key) ?? 0) + snap.followers_count)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  // ── Assemble CSV sections ──────────────────────────────────────────────────

  // Section 1: KPI Summary
  const kpiSection = lines(
    'SECTION: KPI Summary',
    row('Metric', '7-day value', '30-day value'),
    row('Followers (current)', latest?.followers_count ?? '', latest?.followers_count ?? ''),
    row('Reach',               latest?.reach_7d       ?? '', latest?.reach_30d       ?? ''),
    row('Profile Visits',      latest?.profile_views_7d    ?? '', latest?.profile_views_30d    ?? ''),
    row('Accounts Engaged',    latest?.accounts_engaged_7d ?? '', latest?.accounts_engaged_30d ?? ''),
    row('Website Clicks',      latest?.website_clicks_7d   ?? '', latest?.website_clicks_30d   ?? ''),
  )

  // Section 2: Daily reach + net followers (newest → oldest, up to 90 rows)
  const dailyRows = snaps
    .slice()
    .reverse() // oldest → newest for readability
    .map((s) => row(s.date, s.reach ?? '', s.followers_count ?? '', s.unfollows ?? ''))

  const dailySection = lines(
    '',
    'SECTION: Daily Data (oldest → newest, up to 90 days)',
    row('Date', 'Daily Reach', 'Net New Followers', 'Unfollows'),
    ...dailyRows,
  )

  // Section 3: Weekly posting cadence + new followers (12 weeks)
  const cadenceRows = Array.from(cadenceMap.entries()).map(([weekStart, count]) =>
    row(weekStart, count, followersByWeek.get(weekStart) ?? ''),
  )

  const cadenceSection = lines(
    '',
    'SECTION: Weekly Posting Cadence (12 weeks, oldest → newest)',
    row('Week Start (Monday)', 'Posts Published', 'Net New Followers'),
    ...cadenceRows,
  )

  const csv = lines(
    `# Instagram Analytics Export — ${today}`,
    '',
    kpiSection,
    dailySection,
    cadenceSection,
  )

  const filename = `instagram-analytics-${today}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
