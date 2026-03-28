/**
 * Stories This Week widget — shows story activity for the last 7 days.
 * Server component.
 */

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg px-4 py-3"
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">{label}</span>
      <span className="text-[22px] font-bold text-[#f9fafb]">{value}</span>
    </div>
  )
}

export default async function StoriesThisWeekWidget() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profile) return null

  const { data: integration } = await admin
    .from('integrations')
    .select('status')
    .eq('creator_id', profile.id)
    .eq('platform', 'instagram')
    .maybeSingle()

  if (integration?.status !== 'active') return null

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: stories }, { data: sequences }] = await Promise.all([
    admin
      .from('instagram_stories')
      .select('id, impressions, exit_rate')
      .eq('creator_id', profile.id)
      .gte('posted_at', since7d),
    admin
      .from('story_sequences')
      .select('id')
      .eq('creator_id', profile.id)
      .gte('created_at', since7d),
  ])

  const storyList   = stories   ?? []
  const seqList     = sequences ?? []

  const totalImpressions = storyList.reduce((sum, s) => sum + (s.impressions ?? 0), 0)

  const exitRates = storyList
    .map((s) => (s.exit_rate != null ? Number(s.exit_rate) : null))
    .filter((r): r is number => r !== null)
  const avgExitRate = exitRates.length > 0
    ? exitRates.reduce((a, b) => a + b, 0) / exitRates.length
    : null

  return (
    <div
      className="rounded-xl"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-[14px] font-semibold text-[#f9fafb]">Stories This Week</p>
        <Link
          href="/dashboard/stories"
          className="text-[12px] font-semibold transition-colors"
          style={{ color: '#60a5fa' }}
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <StatTile label="Stories" value={String(storyList.length)} />
        <StatTile label="Impressions" value={fmtNum(totalImpressions || null)} />
        <StatTile label="Avg Exit Rate" value={avgExitRate != null ? `${avgExitRate.toFixed(1)}%` : '—'} />
        <StatTile label="Sequences" value={String(seqList.length)} />
      </div>

      {storyList.length === 0 && (
        <div className="pb-5 text-center">
          <p className="text-[12px] text-[#6b7280]">No stories in the last 7 days. Sync to see your story data.</p>
        </div>
      )}
    </div>
  )
}
