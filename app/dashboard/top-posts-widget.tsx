/**
 * Top Posts This Week widget — shows the 5 posts with the highest engagement
 * rate from the last 7 days. Server component.
 */

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Play } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

function truncate(s: string | null, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface TopPost {
  ig_media_id:  string
  caption:      string | null
  media_type:   'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  thumbnail_url: string | null
  media_url:    string | null
  engRate:      number
  views:        number | null
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: TopPost['media_type'] }) {
  const cfg = {
    VIDEO:          { label: 'REEL',     bg: 'rgba(124,58,237,0.18)', color: '#a78bfa' },
    IMAGE:          { label: 'IMAGE',    bg: 'rgba(37,99,235,0.18)',  color: '#60a5fa' },
    CAROUSEL_ALBUM: { label: 'CAROUSEL', bg: 'rgba(5,150,105,0.18)',  color: '#34d399' },
  }[type]
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default async function TopPostsWidget() {
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

  // Don't render widget if Instagram isn't connected
  if (integration?.status !== 'active') return null

  // Posts from last 7 days
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: posts } = await admin
    .from('instagram_posts')
    .select('id, ig_media_id, caption, media_type, thumbnail_url, media_url')
    .eq('creator_id', profile.id)
    .gte('posted_at', since7d)
    .order('posted_at', { ascending: false })

  // ── Empty / no-sync states ────────────────────────────────────────────────

  const isEmpty = !posts || posts.length === 0

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
        <p className="text-[14px] font-semibold text-[#f9fafb]">Top Posts This Week</p>
        <Link
          href="/dashboard/instagram/content"
          className="text-[12px] font-semibold transition-colors"
          style={{ color: '#60a5fa' }}
        >
          View all →
        </Link>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
          <p className="text-[13px] font-medium text-[#f9fafb]">No posts this week</p>
          <p className="mt-1 text-[12px] text-[#6b7280]">Sync your Instagram to see top posts.</p>
        </div>
      ) : (
        <TopPostsList creatorProfileId={profile.id} posts={posts} since7d={since7d} admin={admin} />
      )}
    </div>
  )
}

// ── Inner async list (separate so the empty-state renders without an extra await) ─

async function TopPostsList({
  posts,
  admin,
}: {
  creatorProfileId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posts: any[]
  since7d: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
}) {
  const postIds = posts.map((p: { id: string }) => p.id)

  const { data: metrics } = await admin
    .from('instagram_post_metrics')
    .select('post_id, reach, like_count, comments_count, saved, shares, views')
    .in('post_id', postIds)
    .order('synced_at', { ascending: false })

  // Latest metrics per post
  const metricsMap = new Map<string, {
    reach: number | null; like_count: number | null; comments_count: number | null
    saved: number | null; shares: number | null; views: number | null
  }>()
  for (const m of metrics ?? []) {
    if (!metricsMap.has(m.post_id)) metricsMap.set(m.post_id, m)
  }

  const ranked: TopPost[] = posts
    .map((p: { id: string; ig_media_id: string; caption: string | null; media_type: string; thumbnail_url: string | null; media_url: string | null }) => {
      const m     = metricsMap.get(p.id)
      const reach = m?.reach ?? 0
      const inter = (m?.like_count ?? 0) + (m?.comments_count ?? 0) + (m?.saved ?? 0) + (m?.shares ?? 0)
      const engRate = reach > 0 ? (inter / reach) * 100 : null
      if (engRate === null) return null
      return {
        ig_media_id:  p.ig_media_id,
        caption:      p.caption,
        media_type:   p.media_type as TopPost['media_type'],
        thumbnail_url: p.thumbnail_url,
        media_url:    p.media_url,
        engRate,
        views:        m?.views ?? null,
      }
    })
    .filter((p): p is TopPost => p !== null)
    .sort((a, b) => b.engRate - a.engRate)
    .slice(0, 5)

  if (ranked.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[12px] text-[#6b7280]">Sync your Instagram to see top posts.</p>
      </div>
    )
  }

  return (
    <ul>
      {ranked.map((post, i) => {
        const thumb = post.thumbnail_url ?? post.media_url
        const isReel = post.media_type === 'VIDEO'
        const href   = `/dashboard/instagram/content?post=${post.ig_media_id}`

        return (
          <li
            key={post.ig_media_id}
            style={{ borderBottom: i < ranked.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
          >
            <Link
              href={href}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
            >
              {/* Rank */}
              <span
                className="w-5 shrink-0 text-center text-[12px] font-bold"
                style={{ color: i === 0 ? '#fbbf24' : '#4b5563' }}
              >
                {i + 1}
              </span>

              {/* Thumbnail */}
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                )}
                {isReel && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Play className="h-3 w-3 fill-white text-white" />
                  </div>
                )}
              </div>

              {/* Caption + badge */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[#d1d5db]">
                  {post.caption ? truncate(post.caption, 55) : <span className="text-[#4b5563]">No caption</span>}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <TypeBadge type={post.media_type} />
                  {isReel && post.views != null && (
                    <span className="text-[11px] text-[#6b7280]">{fmtNum(post.views)} views</span>
                  )}
                </div>
              </div>

              {/* Engagement rate */}
              <span
                className="shrink-0 font-mono text-[14px] font-bold"
                style={{ color: post.engRate >= 3 ? '#34d399' : '#9ca3af' }}
              >
                {fmtPct(post.engRate)}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
