import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import SyncBar from '../sync-bar'
import InstagramTabs from '../instagram-tabs'
import PostsTable, { type PostRow, type ReelGroup } from './posts-table'

export default async function ContentPage({
  searchParams,
}: {
  searchParams?: Promise<{ post?: string }> | { post?: string }
}) {
  // searchParams may be a Promise in Next.js 15; await defensively
  const params = searchParams && 'then' in searchParams ? await searchParams : searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  // ── Resolve creator ───────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  // ── Integration status ────────────────────────────────────────────────────
  const { data: integration } = profile
    ? await admin
        .from('integrations')
        .select('status, meta')
        .eq('creator_id', profile.id)
        .eq('platform', 'instagram')
        .maybeSingle()
    : { data: null }

  const connected   = integration?.status === 'active'
  const ig_username = (integration?.meta as { username?: string } | null)?.username ?? null

  // ── Last sync timestamp ───────────────────────────────────────────────────
  const { data: latestSnapshot } = (profile && connected)
    ? await admin
        .from('instagram_account_snapshots')
        .select('created_at')
        .eq('creator_id', profile.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const last_sync = latestSnapshot?.created_at ?? null
  const next_sync = last_sync
    ? new Date(new Date(last_sync).getTime() + 6 * 60 * 60 * 1000).toISOString()
    : null

  const syncStatus = { connected, ig_username, last_sync, next_sync }

  // ── Posts ─────────────────────────────────────────────────────────────────
  const { data: rawPosts } = (profile && connected)
    ? await admin
        .from('instagram_posts')
        .select('id, ig_media_id, caption, media_type, media_url, thumbnail_url, permalink, posted_at, transcript_status, is_trial, video_duration, reel_group_id')
        .eq('creator_id', profile.id)
        .order('posted_at', { ascending: false })
    : { data: null }

  const posts = rawPosts ?? []

  // ── Latest metrics per post ───────────────────────────────────────────────
  // Fetch all metrics rows for these posts, then keep only the latest per post.
  const postIds = posts.map((p) => p.id)

  const [{ data: rawMetrics }, { data: rawTranscripts }, { data: rawGroups }] = await Promise.all([
    postIds.length
      ? admin
          .from('instagram_post_metrics')
          .select('post_id, reach, saved, shares, views, like_count, comments_count, total_interactions, follows_count, replays_count, avg_watch_time_ms, skip_rate, reposts_count, non_follower_reach, follows_count_manual, skip_rate_manual, avg_watch_time_manual, synced_at')
          .in('post_id', postIds)
          .order('synced_at', { ascending: false })
      : Promise.resolve({ data: null }),
    postIds.length
      ? admin
          .from('post_transcripts')
          .select('post_id, transcript_text')
          .in('post_id', postIds)
      : Promise.resolve({ data: null }),
    profile
      ? admin
          .from('reel_groups')
          .select('id, name, created_at')
          .eq('creator_id', profile.id)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: null }),
  ])

  // Deduplicate: first occurrence per post_id = latest sync
  const metricsMap = new Map<string, {
    reach:               number | null
    saved:               number | null
    shares:              number | null
    views:               number | null
    like_count:          number | null
    comments_count:      number | null
    total_interactions:  number | null
    follows_count:       number | null
    replays_count:       number | null
    avg_watch_time_ms:   number | null
    skip_rate:           number | null
    reposts_count:       number | null
    non_follower_reach:  number | null
    follows_count_manual: boolean
    skip_rate_manual:     boolean
    avg_watch_time_manual: boolean
  }>()

  for (const m of rawMetrics ?? []) {
    if (!metricsMap.has(m.post_id)) {
      metricsMap.set(m.post_id, {
        reach:               m.reach              ?? null,
        saved:               m.saved              ?? null,
        shares:              m.shares             ?? null,
        views:               m.views              ?? null,
        like_count:          m.like_count         ?? null,
        comments_count:      m.comments_count     ?? null,
        total_interactions:  m.total_interactions ?? null,
        follows_count:       m.follows_count      ?? null,
        replays_count:       m.replays_count      ?? null,
        avg_watch_time_ms:   m.avg_watch_time_ms  ?? null,
        skip_rate:           m.skip_rate          ?? null,
        reposts_count:       m.reposts_count      ?? null,
        non_follower_reach:  m.non_follower_reach ?? null,
        follows_count_manual: (m as Record<string, unknown>).follows_count_manual === true,
        skip_rate_manual:     (m as Record<string, unknown>).skip_rate_manual     === true,
        avg_watch_time_manual:(m as Record<string, unknown>).avg_watch_time_manual=== true,
      })
    }
  }

  // ── Merge ─────────────────────────────────────────────────────────────────
  const rows: PostRow[] = posts.map((p) => {
    const m = metricsMap.get(p.id) ?? null
    return {
      id:             p.id,
      ig_media_id:    p.ig_media_id,
      caption:        p.caption        ?? null,
      media_type:     p.media_type     as PostRow['media_type'],
      media_url:      p.media_url      ?? null,
      thumbnail_url:  p.thumbnail_url  ?? null,
      permalink:      p.permalink      ?? null,
      posted_at:           p.posted_at,
      transcript_status:   (p.transcript_status ?? 'none') as PostRow['transcript_status'],
      is_trial:            p.is_trial ?? false,
      video_duration:      (p as Record<string, unknown>).video_duration as number | null ?? null,
      reel_group_id:       (p as Record<string, unknown>).reel_group_id as string | null ?? null,
      reach:              m?.reach              ?? null,
      saved:              m?.saved              ?? null,
      shares:             m?.shares             ?? null,
      views:              m?.views              ?? null,
      like_count:         m?.like_count         ?? null,
      comments_count:     m?.comments_count     ?? null,
      total_interactions: m?.total_interactions ?? null,
      follows_count:      m?.follows_count      ?? null,
      replays_count:      m?.replays_count      ?? null,
      avg_watch_time_ms:  m?.avg_watch_time_ms  ?? null,
      skip_rate:           m?.skip_rate          ?? null,
      reposts_count:       m?.reposts_count      ?? null,
      non_follower_reach:  m?.non_follower_reach ?? null,
      follows_count_manual: m?.follows_count_manual  ?? false,
      skip_rate_manual:     m?.skip_rate_manual      ?? false,
      avg_watch_time_manual: m?.avg_watch_time_manual ?? false,
    }
  })

  // ── Transcript text map (post_id → text) ─────────────────────────────────
  const transcriptMap: Record<string, string> = {}
  for (const t of rawTranscripts ?? []) {
    if (t.transcript_text != null) {
      transcriptMap[t.post_id] = t.transcript_text
    }
  }

  // ── Groups ────────────────────────────────────────────────────────────────
  const groups: ReelGroup[] = (rawGroups ?? []).map((g) => ({
    id:         g.id,
    name:       g.name,
    created_at: g.created_at,
  }))

  return (
    <div>
      <PageHeader
        title="Instagram Analytics"
        subtitle={ig_username ? `@${ig_username}` : 'Connect Instagram in Settings to get started.'}
      />

      <SyncBar initial={syncStatus} autoSync={false} />

      <div className="mt-4">
        <InstagramTabs activePath="/dashboard/instagram/content" />
      </div>

      <div className="mt-6">
        {connected ? (
          <PostsTable rows={rows} transcripts={transcriptMap} groups={groups} focusPostId={params?.post ?? null} />
        ) : (
          <div
            className="flex min-h-[40vh] items-center justify-center rounded-xl"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-center">
              <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">Instagram not connected</p>
              <p className="mb-5 text-[13px]" style={{ color: '#9ca3af' }}>
                Go to Settings to connect your Instagram Business account.
              </p>
              <a
                href="/dashboard/settings"
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
                style={{ backgroundColor: '#2563eb' }}
              >
                Go to Settings
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
