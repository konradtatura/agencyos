import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import AddCreatorPanel from './add-creator-panel'
import EditCreatorPanel from './edit-creator-panel'
import { isTokenExpired } from '@/lib/instagram/token'

// ── Types ─────────────────────────────────────────────────────────────────────

type IgAccountRow = {
  username:        string | null
  followers_count: number | null
  updated_at:      string
}

type CreatorRow = {
  id: string
  name: string
  niche: string | null
  ghl_location_id: string | null
  onboarding_complete: boolean
  created_at: string
  users: { email: string; full_name: string | null } | null
  integrations: Array<{ platform: string; status: string; expires_at: string | null }> | null
  instagram_accounts: IgAccountRow | null
}

type StoriesStats = {
  storiesThisWeek: number
  sequenceCount:   number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: 'rgba(37,99,235,0.2)',   text: '#60a5fa' },
  { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
  { bg: 'rgba(16,185,129,0.2)', text: '#34d399' },
  { bg: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
  { bg: 'rgba(236,72,153,0.2)', text: '#f472b6' },
]

function avatarColors(name: string) {
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function relativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr  < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

type IgState = 'connected' | 'expiring' | 'disconnected'

function getIgState(integrations: CreatorRow['integrations']): IgState {
  const ig = integrations?.find((i) => i.platform === 'instagram' && i.status === 'active')
  if (!ig) return 'disconnected'
  if (isTokenExpired(ig.expires_at)) return 'expiring'
  return 'connected'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={
        complete
          ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }
          : { backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24' }
      }
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: complete ? '#34d399' : '#fbbf24' }}
      />
      {complete ? 'Active' : 'Pending Setup'}
    </span>
  )
}

const IG_BADGE: Record<IgState, { bg: string; color: string; dot: string; label: string }> = {
  connected:    { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', dot: '#34d399', label: 'IG Connected'  },
  expiring:     { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', dot: '#f59e0b', label: 'IG Expiring'   },
  disconnected: { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', dot: '#ef4444', label: 'Not Connected' },
}

function InstagramBadge({ state }: { state: IgState }) {
  const s = IG_BADGE[state]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  )
}

function IgStatsRow({ ig }: { ig: IgAccountRow | null }) {
  if (!ig) {
    return (
      <p className="text-[11.5px]" style={{ color: '#4b5563' }}>No Instagram data yet</p>
    )
  }

  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2"
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* IG icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="#6b7280" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="4.5" stroke="#6b7280" strokeWidth="1.75" />
        <circle cx="17.5" cy="6.5" r="1" fill="#6b7280" />
      </svg>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        {ig.username && (
          <span className="truncate text-[11.5px] font-medium text-[#9ca3af]">
            @{ig.username}
          </span>
        )}

        {ig.followers_count != null && (
          <>
            <span className="text-[#374151]">·</span>
            <span className="shrink-0 font-mono text-[11.5px] font-semibold text-[#d1d5db]">
              {fmtFollowers(ig.followers_count)}
            </span>
            <span className="shrink-0 text-[11px] text-[#4b5563]">followers</span>
          </>
        )}
      </div>

      <span className="shrink-0 text-[10.5px] text-[#4b5563]">
        {relativeTime(ig.updated_at)}
      </span>
    </div>
  )
}

function GhlBadge({ locationId }: { locationId: string | null }) {
  if (locationId) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#34d399' }} />
        GHL Connected
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: 'rgba(107,114,128,0.12)', color: '#6b7280' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#6b7280' }} />
      GHL Not Set
    </span>
  )
}

function CreatorCard({ creator, storiesStats }: { creator: CreatorRow; storiesStats: StoriesStats | null }) {
  const colors   = avatarColors(creator.name)
  const initials = getInitials(creator.name)
  const email    = creator.users?.email ?? '—'
  const igState  = getIgState(creator.integrations)

  // Normalize: Supabase returns the FK relation as an array or object depending on cardinality
  const igAccount = Array.isArray(creator.instagram_accounts)
    ? (creator.instagram_accounts[0] ?? null)
    : creator.instagram_accounts

  return (
    <div
      className="flex flex-col rounded-xl p-5"
      style={{
        backgroundColor: '#111827',
        border: igState === 'expiring'
          ? '1px solid rgba(245,158,11,0.25)'
          : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Avatar + badges */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {initials}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <StatusBadge    complete={creator.onboarding_complete} />
          <InstagramBadge state={igState} />
          <GhlBadge locationId={creator.ghl_location_id} />
        </div>
      </div>

      {/* Name */}
      <p className="mb-0.5 text-[14px] font-semibold text-[#f9fafb]">
        {creator.name}
      </p>

      {/* Niche */}
      {creator.niche && (
        <span
          className="mb-3 inline-block self-start rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: 'rgba(37,99,235,0.1)', color: '#60a5fa' }}
        >
          {creator.niche}
        </span>
      )}

      {/* Email + date */}
      <p className="mb-1 text-[12.5px] text-[#9ca3af]">{email}</p>
      <p className="mb-3 text-[11.5px] text-[#4b5563]">Added {formatDate(creator.created_at)}</p>

      {/* Instagram stats (only when connected) */}
      {igState !== 'disconnected' && (
        <IgStatsRow ig={igAccount} />
      )}

      {/* Stories stats */}
      {storiesStats && igState !== 'disconnected' && (
        <div
          className="mt-2 flex items-center gap-4 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#4b5563]">Stories this week</span>
            <span className="font-mono text-[11.5px] font-semibold text-[#d1d5db]">
              {storiesStats.storiesThisWeek}
            </span>
          </div>
          <span className="text-[#374151]">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#4b5563]">Sequences</span>
            <span className="font-mono text-[11.5px] font-semibold text-[#d1d5db]">
              {storiesStats.sequenceCount}
            </span>
          </div>
        </div>
      )}

      {/* Edit button */}
      <div className="mt-4 flex justify-end">
        <EditCreatorPanel
          creatorId={creator.id}
          creatorName={creator.name}
          ghlLocationId={creator.ghl_location_id}
        />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>
        <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">No creators yet</p>
        <p className="text-[13px] text-[#9ca3af]">
          Add your first creator to get started.
        </p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CreatorsPage() {
  // Identity check via session client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // All DB queries via admin client (bypasses RLS — admin page, super_admin only)
  const admin = createAdminClient()

  let creators: CreatorRow[] = []

  try {
    const { data, error } = await admin
      .from('creator_profiles')
      .select(`
        id,
        name,
        niche,
        ghl_location_id,
        onboarding_complete,
        created_at,
        users!user_id ( email, full_name ),
        integrations ( platform, status, expires_at ),
        instagram_accounts ( username, followers_count, updated_at )
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      creators = data as unknown as CreatorRow[]
    }
  } catch {
    // Supabase not yet configured — show empty state
  }

  // ── Batch-fetch stories + sequences stats for all creators ─────────────────
  const since7d      = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const creatorIds   = creators.map((c) => c.id)
  const storiesStatsMap = new Map<string, StoriesStats>()

  if (creatorIds.length > 0) {
    const [{ data: storyRows }, { data: seqRows }] = await Promise.all([
      admin
        .from('instagram_stories')
        .select('creator_id')
        .in('creator_id', creatorIds)
        .gte('posted_at', since7d),
      admin
        .from('story_sequences')
        .select('creator_id')
        .in('creator_id', creatorIds),
    ])

    for (const cId of creatorIds) {
      storiesStatsMap.set(cId, {
        storiesThisWeek: (storyRows ?? []).filter((r) => r.creator_id === cId).length,
        sequenceCount:   (seqRows   ?? []).filter((r) => r.creator_id === cId).length,
      })
    }
  }

  const subtitle = creators.length > 0
    ? `${creators.length} creator${creators.length !== 1 ? 's' : ''}`
    : 'Manage creator accounts and onboarding'

  return (
    <div>
      <PageHeader title="Creators" subtitle={subtitle}>
        <AddCreatorPanel />
      </PageHeader>

      {creators.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {creators.map((creator) => (
            <CreatorCard
              key={creator.id}
              creator={creator}
              storiesStats={storiesStatsMap.get(creator.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
