'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Play, ChevronUp, ChevronDown, ChevronsUpDown, Search, CheckSquare, Square, Pencil, Link2, ChevronRight, MoreHorizontal, X, Layers } from 'lucide-react'
import PostDetailPanel from './post-detail-panel'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReelGroup {
  id:         string
  name:       string
  created_at: string
}

export interface PostRow {
  id:                  string
  ig_media_id:         string
  caption:             string | null
  media_type:          'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url:           string | null
  thumbnail_url:       string | null
  permalink:           string | null
  posted_at:           string
  transcript_status:   'none' | 'processing' | 'done'
  is_trial:            boolean
  reel_group_id:       string | null
  reach:               number | null
  saved:               number | null
  shares:              number | null
  views:               number | null
  like_count:          number | null
  comments_count:      number | null
  total_interactions:  number | null
  profile_visits:      number | null
  follows_count:       number | null
  replays_count:           number | null
  avg_watch_time_ms:       number | null   // stored in milliseconds; divide by 1000 for display
  skip_rate:               number | null   // stored %, e.g. 62.4 means 62.4%
  reposts_count:           number | null
  non_follower_reach:      number | null
  video_duration:          number | null   // seconds, from instagram_posts
  // Manual-entry flags — true when the value was entered by the creator, not pulled from API
  follows_count_manual:    boolean
  skip_rate_manual:        boolean
  avg_watch_time_manual:   boolean
}

export interface AccountAverages {
  views:              number | null
  reach:              number | null
  like_count:         number | null
  comments_count:     number | null
  saved:              number | null
  shares:             number | null
  follows_count:      number | null
  replays_count:      number | null
  avg_watch_time_ms:  number | null
  skip_rate:          number | null
  reposts_count:      number | null
  non_follower_reach: number | null
  engagement_rate:    number | null
  save_rate:          number | null
  share_rate:         number | null
  profile_visit_rate: number | null
  replay_rate:        number | null
  avg_watch_rate:     number | null
  hook_rate:          number | null
}

type ManualField = 'follows_count' | 'skip_rate' | 'avg_watch_time_ms'

type SortKey =
  | 'posted_at' | 'views' | 'reach' | 'like_count'
  | 'comments_count' | 'saved' | 'shares'
  | 'engagement_rate' | 'save_rate' | 'profile_visit_rate' | 'replay_rate' | 'avg_watch_rate' | 'hook_rate'

type SortDir = 'asc' | 'desc'

type MediaFilter = 'ALL' | 'VIDEO' | 'IMAGE' | 'CAROUSEL_ALBUM' | 'TRIAL' | 'NORMAL_REELS' | 'GROUPED'

type ViewMode = 'table' | 'groups'

type DateRange = '7d' | '30d' | '90d' | 'all'

const PAGE_SIZE = 20

// ── Metric helpers ─────────────────────────────────────────────────────────────

export function calcEngagementRate(row: PostRow): number | null {
  if (!row.reach) return null
  const n = (row.like_count ?? 0) + (row.comments_count ?? 0) + (row.saved ?? 0) + (row.shares ?? 0)
  return (n / row.reach) * 100
}

export function calcSaveRate(row: PostRow): number | null {
  if (!row.reach || row.saved == null) return null
  return (row.saved / row.reach) * 100
}

export function calcShareRate(row: PostRow): number | null {
  if (!row.reach || row.shares == null) return null
  return (row.shares / row.reach) * 100
}

/** Profile visits ÷ Reach × 100. % of reached accounts who visited the profile. */
export function calcProfileVisitRate(row: PostRow): number | null {
  if (!row.reach || row.profile_visits == null) return null
  return (row.profile_visits / row.reach) * 100
}

/** Views ÷ Reach. Can exceed 100% when people rewatch. */
export function calcReplayRate(row: PostRow): number | null {
  if (row.media_type !== 'VIDEO' || !row.reach || row.views == null) return null
  return (row.views / row.reach) * 100
}

/** avg_watch_time (ms→seconds) ÷ video_duration (seconds), capped at 100%. */
export function calcAvgWatchRate(row: PostRow): number | null {
  if (row.media_type !== 'VIDEO' || row.avg_watch_time_ms == null || !row.video_duration) return null
  return Math.min(((row.avg_watch_time_ms / 1000) / row.video_duration) * 100, 100)
}

/** Views ÷ Reach × 100. Approximation of the % of reached accounts who played the reel. */
export function calcHookRate(row: PostRow): number | null {
  if (row.media_type !== 'VIDEO' || !row.reach || row.views == null) return null
  return (row.views / row.reach) * 100
}

function avgOf(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null)
  if (!valid.length) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export function computeAverages(rows: PostRow[]): AccountAverages {
  const reels = rows.filter((r) => r.media_type === 'VIDEO')
  return {
    views:              avgOf(rows.map((r) => r.views)),
    reach:              avgOf(rows.map((r) => r.reach)),
    like_count:         avgOf(rows.map((r) => r.like_count)),
    comments_count:     avgOf(rows.map((r) => r.comments_count)),
    saved:              avgOf(rows.map((r) => r.saved)),
    shares:             avgOf(rows.map((r) => r.shares)),
    follows_count:      avgOf(rows.map((r) => r.follows_count)),
    replays_count:      avgOf(reels.map((r) => r.replays_count)),
    avg_watch_time_ms:  avgOf(reels.map((r) => r.avg_watch_time_ms)),
    skip_rate:          avgOf(reels.map((r) => r.skip_rate)),
    reposts_count:      avgOf(rows.map((r) => r.reposts_count)),
    non_follower_reach: avgOf(rows.map((r) => r.non_follower_reach)),
    engagement_rate:    avgOf(rows.map((r) => calcEngagementRate(r))),
    save_rate:          avgOf(rows.map((r) => calcSaveRate(r))),
    share_rate:         avgOf(rows.map((r) => calcShareRate(r))),
    profile_visit_rate: avgOf(rows.map((r) => calcProfileVisitRate(r))),
    replay_rate:        avgOf(reels.map((r) => calcReplayRate(r))),
    avg_watch_rate:     avgOf(reels.map((r) => calcAvgWatchRate(r))),
    hook_rate:          avgOf(reels.map((r) => calcHookRate(r))),
  }
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

function fmtWatchTime(ms: number | null): string {
  if (ms == null) return '—'
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function truncate(s: string | null, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function daysAgoMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000
}

// ── Badges ─────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: PostRow['media_type'] }) {
  const cfg = {
    VIDEO:          { label: 'REEL',     bg: 'rgba(124,58,237,0.18)', color: '#a78bfa' },
    IMAGE:          { label: 'IMAGE',    bg: 'rgba(37,99,235,0.18)',  color: '#60a5fa' },
    CAROUSEL_ALBUM: { label: 'CAROUSEL', bg: 'rgba(5,150,105,0.18)',  color: '#34d399' },
  }[type]
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function TrialBadge() {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
      style={{ backgroundColor: 'rgba(251,146,60,0.18)', color: '#fb923c' }}
    >
      TRIAL
    </span>
  )
}

// ── Sort icon ──────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 text-[#4b5563]" />
  if (sortDir === 'asc')  return <ChevronUp   className="h-3.5 w-3.5 text-[#60a5fa]" />
  return <ChevronDown className="h-3.5 w-3.5 text-[#60a5fa]" />
}

function Th({
  children, col, sortKey, sortDir, onClick, align = 'right', title,
}: {
  children: React.ReactNode
  col: SortKey; sortKey: SortKey; sortDir: SortDir
  onClick: (col: SortKey) => void
  align?: 'left' | 'right'
  title?: string
}) {
  return (
    <th
      title={title}
      className={`whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280] cursor-pointer select-none hover:text-[#9ca3af] transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onClick(col)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {children}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  )
}

// ── Skeleton / empty ───────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="px-3 py-3"><div className="h-[50px] w-[50px] animate-pulse rounded-lg bg-white/[0.06]" /></td>
      <td className="px-3 py-3"><div className="h-3 w-48 animate-pulse rounded bg-white/[0.06]" /></td>
      <td className="px-3 py-3"><div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" /></td>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3 text-right">
          <div className="ml-auto h-3 w-10 animate-pulse rounded bg-white/[0.06]" />
        </td>
      ))}
    </tr>
  )
}

function EmptyState({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center">
        <p className="text-[14px] font-semibold text-[#f9fafb]">No posts synced yet.</p>
        <p className="mt-1 text-[13px] text-[#6b7280]">Click Sync Now to import your content.</p>
      </td>
    </tr>
  )
}

// ── Transcript status dot ──────────────────────────────────────────────────────

function TranscriptDot({
  status,
  onClick,
}: {
  status:  PostRow['transcript_status']
  onClick: (e: React.MouseEvent) => void
}) {
  if (status === 'processing') {
    return (
      <span
        title="Transcribing…"
        className="inline-block h-2 w-2 animate-pulse rounded-full"
        style={{ backgroundColor: '#f59e0b' }}
      />
    )
  }
  if (status === 'done') {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Transcript available — click to view"
        className="inline-block h-2 w-2 rounded-full transition-opacity hover:opacity-60"
        style={{ backgroundColor: '#34d399' }}
      />
    )
  }
  // none — gray, not interactive
  return (
    <span
      title="Not transcribed"
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: '#374151' }}
    />
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all"
      style={
        active
          ? { backgroundColor: 'rgba(37,99,235,0.25)', color: '#60a5fa' }
          : { color: '#6b7280' }
      }
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  rows:          PostRow[]
  transcripts?:  Record<string, string>   // post_id → transcript_text
  loading?:      boolean
  focusPostId?:  string | null
  groups?:       ReelGroup[]
}

export default function PostsTable({ rows, transcripts = {}, loading = false, focusPostId = null, groups: initialGroups = [] }: Props) {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────────────────
  const [sortKey,             setSortKey]             = useState<SortKey>('posted_at')
  const [sortDir,             setSortDir]             = useState<SortDir>('desc')
  const [filter,              setFilter]              = useState<MediaFilter>('ALL')
  const [dateRange,           setDateRange]           = useState<DateRange>('all')
  const [search,              setSearch]              = useState('')
  const [page,                setPage]                = useState(1)
  const [selectedPost,        setSelectedPost]        = useState<PostRow | null>(null)
  const [openWithTranscript,  setOpenWithTranscript]  = useState(false)
  const [bulkMode,            setBulkMode]            = useState(false)
  const [selectedIds,         setSelectedIds]         = useState<Set<string>>(new Set())
  // Optimistic overrides
  const [trialOverrides,      setTrialOverrides]      = useState<Map<string, boolean>>(new Map())
  const [transcriptOverrides, setTranscriptOverrides] = useState<Map<string, PostRow['transcript_status']>>(new Map())
  // Bulk transcription
  type BulkTranscribeStatus = 'idle' | 'running' | 'done'
  const [bulkTranscribeStatus,   setBulkTranscribeStatus]   = useState<BulkTranscribeStatus>('idle')
  const [bulkTranscribeProgress, setBulkTranscribeProgress] = useState({
    current:   0,
    total:     0,
    failed:    [] as string[],   // post IDs
    completed: [] as string[],   // post IDs
  })
  const [bulkTranscribeLimitMsg, setBulkTranscribeLimitMsg] = useState<string | null>(null)

  // Inline metric editing
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: ManualField } | null>(null)
  const [editValue,   setEditValue]   = useState('')
  const [metricOverrides, setMetricOverrides] = useState<Map<string, Partial<PostRow>>>(new Map())
  const committingRef = useRef(false)

  // ── Grouping state ─────────────────────────────────────────────────────────
  const [viewMode,        setViewMode]        = useState<ViewMode>('table')
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set())
  const [localGroups,     setLocalGroups]     = useState<ReelGroup[]>(initialGroups)
  const [groupOverrides,  setGroupOverrides]  = useState<Map<string, string | null>>(new Map())
  // Context menu
  const [contextMenu, setContextMenu] = useState<{ postId: string; x: number; y: number } | null>(null)
  // Group assignment modal
  const [groupModal, setGroupModal] = useState<{ postId: string } | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  // Inline group rename
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue,     setRenameValue]     = useState('')

  // Auto-open from URL param (?post=<ig_media_id>)
  useEffect(() => {
    if (!focusPostId) return
    const post = rows.find((r) => r.ig_media_id === focusPostId)
    if (post) setSelectedPost({ ...post, is_trial: trialOverrides.get(post.id) ?? post.is_trial })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPostId, rows])

  // Merge server rows with optimistic overrides (trial + transcript status + inline metric edits + group)
  const mergedRows = useMemo(() => {
    return rows.map((r) => {
      const trialVal      = trialOverrides.get(r.id)
      const transcriptVal = transcriptOverrides.get(r.id)
      const metricOver    = metricOverrides.get(r.id)
      const groupOver     = groupOverrides.has(r.id) ? groupOverrides.get(r.id) : undefined
      if (trialVal === undefined && transcriptVal === undefined && !metricOver && groupOver === undefined) return r
      return {
        ...r,
        ...(trialVal      !== undefined ? { is_trial:          trialVal      } : {}),
        ...(transcriptVal !== undefined ? { transcript_status: transcriptVal } : {}),
        ...(groupOver     !== undefined ? { reel_group_id:     groupOver     } : {}),
        ...(metricOver    ?? {}),
      }
    })
  }, [rows, trialOverrides, transcriptOverrides, metricOverrides, groupOverrides])

  // ── Derived data ───────────────────────────────────────────────────────────
  const averages = useMemo(() => computeAverages(mergedRows), [mergedRows])

  function downloadCsv() {
    const typeLabel = (t: PostRow['media_type']) =>
      t === 'VIDEO' ? 'Reel' : t === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Image'

    const headers = [
      'Date Posted',
      'Caption',
      'Type',
      'Is Trial',
      'Views',
      'Reach',
      'Likes',
      'Comments',
      'Saves',
      'Shares',
      'Reposts',
      'Follows',
      'Avg Watch Time (s)',
      'Avg Watch %',
      'Skip Rate %',
      'Replay Rate %',
      'Hook Rate %',
      'Engagement Rate %',
      'Save Rate %',
      'Share Rate %',
      'Video Duration (s)',
      'Transcript',
      'Transcript Status',
      'Instagram URL',
    ]

    const csvRows = sorted.map((row) => {
      const eng          = calcEngagementRate(row)
      const save         = calcSaveRate(row)
      const share        = calcShareRate(row)
      const replay       = calcReplayRate(row)
      const avgWatchRate = calcAvgWatchRate(row)
      const hookRate     = calcHookRate(row)
      const watchSec     = row.avg_watch_time_ms != null ? (row.avg_watch_time_ms / 1000).toFixed(2) : ''

      return [
        fmtDate(row.posted_at),
        row.caption ?? '',
        typeLabel(row.media_type),
        row.is_trial ? 'true' : 'false',
        row.views          ?? '',
        row.reach          ?? '',
        row.like_count     ?? '',
        row.comments_count ?? '',
        row.saved          ?? '',
        row.shares         ?? '',
        row.reposts_count  ?? '',
        row.follows_count  ?? '',
        watchSec,
        avgWatchRate != null ? avgWatchRate.toFixed(1) : '',
        row.skip_rate != null ? row.skip_rate.toFixed(2) : '',
        replay != null ? replay.toFixed(2) : '',
        hookRate != null ? hookRate.toFixed(1) : '',
        eng    != null ? eng.toFixed(2)    : '',
        save   != null ? save.toFixed(2)   : '',
        share  != null ? share.toFixed(2)  : '',
        row.video_duration ?? '',
        transcripts[row.id] ?? '',
        row.transcript_status,
        row.permalink ?? '',
      ]
    })

    // RFC 4180: wrap every field in double-quotes, escape internal quotes as ""
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
    const csv = [headers, ...csvRows]
      .map((r) => r.map(escape).join(','))
      .join('\r\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `instagram-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = useMemo(() => {
    let r = mergedRows

    switch (filter) {
      case 'VIDEO':          r = r.filter((p) => p.media_type === 'VIDEO'); break
      case 'IMAGE':          r = r.filter((p) => p.media_type === 'IMAGE'); break
      case 'CAROUSEL_ALBUM': r = r.filter((p) => p.media_type === 'CAROUSEL_ALBUM'); break
      case 'TRIAL':          r = r.filter((p) => p.media_type === 'VIDEO' && p.is_trial); break
      case 'NORMAL_REELS':   r = r.filter((p) => p.media_type === 'VIDEO' && !p.is_trial); break
      case 'GROUPED':        r = r.filter((p) => p.reel_group_id !== null); break
    }

    if (dateRange !== 'all') {
      const days   = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const cutoff = daysAgoMs(days)
      r = r.filter((p) => new Date(p.posted_at).getTime() >= cutoff)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter((p) => (p.caption ?? '').toLowerCase().includes(q))
    }

    return r
  }, [mergedRows, filter, dateRange, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | null = null
      let bv: number | null = null
      switch (sortKey) {
        case 'posted_at':      av = new Date(a.posted_at).getTime(); bv = new Date(b.posted_at).getTime(); break
        case 'views':          av = a.views;          bv = b.views;          break
        case 'reach':          av = a.reach;          bv = b.reach;          break
        case 'like_count':     av = a.like_count;     bv = b.like_count;     break
        case 'comments_count': av = a.comments_count; bv = b.comments_count; break
        case 'saved':          av = a.saved;          bv = b.saved;          break
        case 'shares':         av = a.shares;         bv = b.shares;         break
        case 'engagement_rate':    av = calcEngagementRate(a);    bv = calcEngagementRate(b);    break
        case 'save_rate':          av = calcSaveRate(a);          bv = calcSaveRate(b);          break
        case 'profile_visit_rate': av = calcProfileVisitRate(a);  bv = calcProfileVisitRate(b);  break
        case 'replay_rate':        av = calcReplayRate(a);        bv = calcReplayRate(b);        break
        case 'avg_watch_rate':  av = calcAvgWatchRate(a);     bv = calcAvgWatchRate(b);     break
        case 'hook_rate':       av = calcHookRate(a);          bv = calcHookRate(b);          break
      }
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(col); setSortDir('desc') }
    setPage(1)
  }

  function handleFilterChange(f: MediaFilter) {
    setFilter(f)
    setPage(1)
  }

  function handleDateRangeChange(r: DateRange) {
    setDateRange(r)
    setPage(1)
  }

  function handleRowClick(row: PostRow) {
    if (bulkMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(row.id)) next.delete(row.id)
        else next.add(row.id)
        return next
      })
    } else {
      setSelectedPost(row)
      setOpenWithTranscript(false)
    }
  }

  function handleTranscriptDotClick(e: React.MouseEvent, row: PostRow) {
    e.stopPropagation()
    setSelectedPost(row)
    setOpenWithTranscript(true)
  }

  function exitBulkMode() {
    setBulkMode(false)
    setSelectedIds(new Set())
    setBulkTranscribeStatus('idle')
    setBulkTranscribeProgress({ current: 0, total: 0, failed: [], completed: [] })
    setBulkTranscribeLimitMsg(null)
  }

  // ── Transcript callbacks ────────────────────────────────────────────────────
  function handleTranscribeStart(postId: string) {
    setTranscriptOverrides((prev) => new Map(prev).set(postId, 'processing'))
  }

  function handleTranscribed(postId: string) {
    setTranscriptOverrides((prev) => new Map(prev).set(postId, 'done'))
  }

  function handleTranscribeFailed(postId: string) {
    setTranscriptOverrides((prev) => {
      const next = new Map(prev)
      next.delete(postId)
      return next
    })
  }

  async function handleBulkTrial(is_trial: boolean) {
    const ids = Array.from(selectedIds)
    // Optimistic overrides
    setTrialOverrides((prev) => {
      const next = new Map(prev)
      ids.forEach((id) => next.set(id, is_trial))
      return next
    })
    exitBulkMode()

    const res = await fetch('/api/instagram/posts/trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_ids: ids, is_trial }),
    })
    if (!res.ok) router.refresh()   // re-fetch to get authoritative state
  }

  // ── Bulk transcription ─────────────────────────────────────────────────────

  async function runTranscribeBatch(postRows: PostRow[]) {
    const toTranscribe = postRows.filter((r) => r.media_type === 'VIDEO' && r.transcript_status !== 'done')
    if (toTranscribe.length === 0) return

    setBulkTranscribeStatus('running')
    setBulkTranscribeProgress({ current: 0, total: toTranscribe.length, failed: [], completed: [] })
    setBulkTranscribeLimitMsg(null)

    const failed:    string[] = []
    const completed: string[] = []

    for (const row of toTranscribe) {
      setTranscriptOverrides((prev) => new Map(prev).set(row.id, 'processing'))

      const res = await fetch('/api/instagram/transcribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId: row.id }),
      })

      if (res.ok) {
        setTranscriptOverrides((prev) => new Map(prev).set(row.id, 'done'))
        completed.push(row.id)
      } else {
        setTranscriptOverrides((prev) => { const next = new Map(prev); next.delete(row.id); return next })
        failed.push(row.id)
      }

      setBulkTranscribeProgress({ current: completed.length + failed.length, total: toTranscribe.length, failed: [...failed], completed: [...completed] })
    }

    setBulkTranscribeStatus('done')
  }

  async function handleBulkTranscribe() {
    const allSelected = Array.from(selectedIds)
      .map((id) => mergedRows.find((r) => r.id === id))
      .filter((r): r is PostRow => r !== undefined)

    const videoRows    = allSelected.filter((r) => r.media_type === 'VIDEO')
    const toTranscribe = videoRows.filter((r) => r.transcript_status !== 'done')

    if (toTranscribe.length > 20) {
      setBulkTranscribeLimitMsg(`Maximum 20 reels per batch. Please deselect some.`)
      return
    }

    setBulkTranscribeLimitMsg(null)

    // Check daily limit
    const usageRes = await fetch('/api/instagram/transcribe/daily-usage')
    const usage    = await usageRes.json() as { count: number; limit: number; remaining: number }

    if (usage.remaining <= 0) {
      setBulkTranscribeLimitMsg(`Daily limit reached (${usage.count}/${usage.limit}). Resets tomorrow.`)
      return
    }

    if (toTranscribe.length > usage.remaining) {
      setBulkTranscribeLimitMsg(`You can transcribe ${usage.remaining} more reel${usage.remaining !== 1 ? 's' : ''} today.`)
      // Continue with only what's allowed
      await runTranscribeBatch(toTranscribe.slice(0, usage.remaining))
      return
    }

    await runTranscribeBatch(toTranscribe)
  }

  async function handleRetryFailed() {
    const failedRows = bulkTranscribeProgress.failed
      .map((id) => mergedRows.find((r) => r.id === id))
      .filter((r): r is PostRow => r !== undefined)
    await runTranscribeBatch(failedRows)
  }

  function resetBulkTranscribe() {
    setBulkTranscribeStatus('idle')
    setBulkTranscribeProgress({ current: 0, total: 0, failed: [], completed: [] })
    setBulkTranscribeLimitMsg(null)
  }

  // ── Inline metric editing ──────────────────────────────────────────────────

  function startEdit(rowId: string, field: ManualField, currentStoredValue: number | null) {
    const display = currentStoredValue == null ? ''
      : field === 'avg_watch_time_ms' ? (currentStoredValue / 1000).toFixed(1)
      : String(currentStoredValue)
    committingRef.current = false
    setEditingCell({ rowId, field })
    setEditValue(display)
  }

  async function commitEdit(rowId: string, field: ManualField) {
    if (committingRef.current) return
    committingRef.current = true
    const val = editValue
    setEditingCell(null)
    setEditValue('')

    const parsed = parseFloat(val)
    if (isNaN(parsed) || parsed < 0 || val.trim() === '') {
      committingRef.current = false
      return
    }
    const storeValue = field === 'avg_watch_time_ms' ? Math.round(parsed * 1000) : parsed
    const manualFlag = `${field}_manual` as 'follows_count_manual' | 'skip_rate_manual' | 'avg_watch_time_manual'

    // Optimistic update
    setMetricOverrides((prev) => {
      const next = new Map(prev)
      next.set(rowId, { ...(next.get(rowId) ?? {}), [field]: storeValue, [manualFlag]: true })
      return next
    })

    try {
      await fetch('/api/instagram/posts/manual-metrics', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ post_id: rowId, field, value: storeValue }),
      })
    } finally {
      committingRef.current = false
    }
  }

  function cancelEdit() {
    committingRef.current = false
    setEditingCell(null)
    setEditValue('')
  }

  // ── Group helpers ──────────────────────────────────────────────────────────

  const callGroupsApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/instagram/posts/groups', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return res.ok ? res.json() : null
  }, [])

  async function handleAssignGroup(postId: string, groupId: string | null) {
    setGroupOverrides((prev) => new Map(prev).set(postId, groupId))
    setContextMenu(null)
    setGroupModal(null)
    await callGroupsApi({ action: 'assign', post_id: postId, group_id: groupId })
  }

  async function handleCreateAndAssign(postId: string) {
    const name = newGroupName.trim()
    if (!name) return
    setCreatingGroup(true)
    const result = await callGroupsApi({ action: 'create', name })
    if (result?.group) {
      setLocalGroups((prev) => [...prev, result.group as ReelGroup])
      await handleAssignGroup(postId, result.group.id)
    }
    setNewGroupName('')
    setCreatingGroup(false)
  }

  async function handleRenameGroup(groupId: string) {
    const name = renameValue.trim()
    if (!name) { setRenamingGroupId(null); return }
    setLocalGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, name } : g))
    setRenamingGroupId(null)
    setRenameValue('')
    await callGroupsApi({ action: 'rename', group_id: groupId, name })
  }

  async function handleUngroupAll(groupId: string) {
    // Optimistically clear all posts in this group
    setGroupOverrides((prev) => {
      const next = new Map(prev)
      mergedRows
        .filter((r) => r.reel_group_id === groupId)
        .forEach((r) => next.set(r.id, null))
      return next
    })
    setLocalGroups((prev) => prev.filter((g) => g.id !== groupId))
    await callGroupsApi({ action: 'ungroup_all', group_id: groupId })
  }

  // Groups view data — compute once from sorted rows
  const groupsViewData = useMemo(() => {
    const groupMap = new Map<string, PostRow[]>()
    const ungrouped: PostRow[] = []
    for (const row of sorted) {
      if (row.reel_group_id) {
        const bucket = groupMap.get(row.reel_group_id) ?? []
        bucket.push(row)
        groupMap.set(row.reel_group_id, bucket)
      } else {
        ungrouped.push(row)
      }
    }
    return { groupMap, ungrouped }
  }, [sorted])

  // ── Render ─────────────────────────────────────────────────────────────────

  const filterTabs: { key: MediaFilter; label: string }[] = [
    { key: 'ALL',            label: 'All' },
    { key: 'VIDEO',          label: 'Reels' },
    { key: 'TRIAL',          label: 'Trial Reels' },
    { key: 'NORMAL_REELS',   label: 'Normal Reels' },
    { key: 'GROUPED',        label: 'Grouped' },
    { key: 'IMAGE',          label: 'Images' },
    { key: 'CAROUSEL_ALBUM', label: 'Carousels' },
  ]

  const dateRangeTabs: { key: DateRange; label: string }[] = [
    { key: '7d',  label: 'Last 7d' },
    { key: '30d', label: 'Last 30d' },
    { key: '90d', label: 'Last 90d' },
    { key: 'all', label: 'All time' },
  ]

  // Extra columns when in bulk mode
  // Base: Thumb + Caption + Type + Date + Views + Reach + Likes + Comments +
  //       Saves + Shares + Reposts + Follows + Avg Watch + Avg Watch % + Skip Rate + Eng Rate + Save Rate + Replay Rate = 18
  const colSpanBase = 19
  const colSpan = bulkMode ? colSpanBase + 1 : colSpanBase

  return (
    <div className="space-y-4">
      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Media type filter */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          {filterTabs.map(({ key, label }) => (
            <TabBtn key={key} active={filter === key} onClick={() => handleFilterChange(key)}>
              {label}
            </TabBtn>
          ))}
        </div>

        {/* Date range */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          {dateRangeTabs.map(({ key, label }) => (
            <TabBtn key={key} active={dateRange === key} onClick={() => handleDateRangeChange(key)}>
              {label}
            </TabBtn>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4b5563]" />
          <input
            type="text"
            placeholder="Search captions…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="rounded-lg py-1.5 pl-8 pr-3 text-[13px] text-[#f9fafb] outline-none placeholder:text-[#4b5563] focus:ring-1 focus:ring-[#2563eb]/50"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', width: 190 }}
          />
        </div>

        {/* Export CSV */}
        <button
          type="button"
          onClick={downloadCsv}
          className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
        >
          Export CSV
        </button>

        {/* View mode toggle */}
        <button
          type="button"
          onClick={() => setViewMode((m) => m === 'table' ? 'groups' : 'table')}
          title={viewMode === 'groups' ? 'Switch to table view' : 'Switch to groups view'}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all"
          style={
            viewMode === 'groups'
              ? { backgroundColor: 'rgba(37,99,235,0.18)', border: '1px solid rgba(37,99,235,0.30)', color: '#60a5fa' }
              : { backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }
          }
        >
          <Layers className="h-3.5 w-3.5" />
          Groups
        </button>

        {/* Bulk select / cancel */}
        <div className="ml-auto">
          {bulkMode ? (
            <button
              type="button"
              onClick={exitBulkMode}
              className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBulkMode(true)}
              className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all"
              style={{ backgroundColor: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.18)', color: '#60a5fa' }}
            >
              Select
            </button>
          )}
        </div>
      </div>

      {/* ── Groups view ──────────────────────────────────────────────── */}
      {viewMode === 'groups' && (
        <div className="space-y-2">
          {/* Group rows */}
          {Array.from(groupsViewData.groupMap.entries()).map(([groupId, groupRows]) => {
            const group      = localGroups.find((g) => g.id === groupId)
            const isExpanded = expandedGroups.has(groupId)
            const sumViews   = groupRows.reduce((s: number, r: PostRow) => s + (r.views ?? 0), 0)
            const sumReach   = groupRows.reduce((s: number, r: PostRow) => s + (r.reach ?? 0), 0)
            const sumLikes   = groupRows.reduce((s: number, r: PostRow) => s + (r.like_count ?? 0), 0)
            const avgEng     = avgOf(groupRows.map((r: PostRow) => calcEngagementRate(r)))
            const avgWatch   = avgOf(groupRows.map((r: PostRow) => calcAvgWatchRate(r)))
            return (
              <div
                key={groupId}
                className="overflow-hidden rounded-xl"
                style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* Group header row */}
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
                  onClick={() => setExpandedGroups((prev) => {
                    const next = new Set(prev)
                    if (next.has(groupId)) next.delete(groupId)
                    else next.add(groupId)
                    return next
                  })}
                >
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[#6b7280] transition-transform"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                  />
                  {/* Group name — inline editable */}
                  {renamingGroupId === groupId ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleRenameGroup(groupId) }
                        if (e.key === 'Escape') { setRenamingGroupId(null) }
                      }}
                      onBlur={() => handleRenameGroup(groupId)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded px-2 py-0.5 text-[13px] font-semibold text-[#f9fafb] outline-none"
                      style={{ backgroundColor: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.35)', minWidth: 180 }}
                    />
                  ) : (
                    <span
                      className="text-[13px] font-semibold text-[#f9fafb]"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setRenamingGroupId(groupId)
                        setRenameValue(group?.name ?? '')
                      }}
                      title="Double-click to rename"
                    >
                      {group?.name ?? 'Unknown Group'}
                    </span>
                  )}
                  <span className="rounded px-1.5 py-0.5 text-[11px] text-[#6b7280]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                    {groupRows.length} reel{groupRows.length !== 1 ? 's' : ''}
                  </span>
                  {/* Combined metrics */}
                  <div className="ml-auto flex items-center gap-5 text-[12px] text-[#9ca3af]">
                    <span title="Total views"><span className="text-[#d1d5db] font-mono">{fmtNum(sumViews)}</span> views</span>
                    <span title="Total reach"><span className="text-[#d1d5db] font-mono">{fmtNum(sumReach)}</span> reach</span>
                    <span title="Total likes"><span className="text-[#d1d5db] font-mono">{fmtNum(sumLikes)}</span> likes</span>
                    <span title="Avg engagement rate"><span className="text-[#d1d5db] font-mono">{fmtPct(avgEng)}</span> eng</span>
                    <span title="Avg watch %"><span className="text-[#d1d5db] font-mono">{fmtPct(avgWatch)}</span> watch</span>
                  </div>
                  {/* Group actions */}
                  <div className="flex items-center gap-1 pl-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => { setRenamingGroupId(groupId); setRenameValue(group?.name ?? '') }}
                      className="rounded px-2 py-0.5 text-[11px] text-[#6b7280] hover:bg-white/10 hover:text-[#9ca3af]"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUngroupAll(groupId)}
                      className="rounded px-2 py-0.5 text-[11px] text-[#6b7280] hover:bg-red-500/10 hover:text-red-400"
                    >
                      Ungroup all
                    </button>
                  </div>
                </div>
                {/* Expanded reels */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {groupRows.map((row: PostRow) => {
                      const engRate = calcEngagementRate(row)
                      return (
                        <div
                          key={row.id}
                          className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[0.02]"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                          onClick={() => { setSelectedPost(row); setOpenWithTranscript(false) }}
                        >
                          <div className="w-4 shrink-0" />
                          {row.thumbnail_url || row.media_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.thumbnail_url ?? row.media_url ?? ''}
                              alt=""
                              width={36} height={36}
                              className="h-9 w-9 shrink-0 rounded-md object-cover"
                              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                            />
                          ) : (
                            <div className="h-9 w-9 shrink-0 rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                          )}
                          <span className="flex-1 truncate text-[#d1d5db]" title={row.caption ?? ''}>
                            {truncate(row.caption, 60) || <span className="text-[#4b5563]">No caption</span>}
                          </span>
                          <span className="shrink-0 text-[12px] text-[#6b7280]">{fmtDate(row.posted_at)}</span>
                          <span className="w-20 text-right font-mono text-[#9ca3af]">{fmtNum(row.views)}</span>
                          <span className="w-20 text-right font-mono text-[#9ca3af]">{fmtNum(row.reach)}</span>
                          <span className="w-20 text-right font-mono" style={{ color: engRate !== null && engRate >= 3 ? '#34d399' : '#9ca3af' }}>
                            {fmtPct(engRate)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleAssignGroup(row.id, null) }}
                            className="rounded p-1 text-[#4b5563] hover:bg-red-500/10 hover:text-red-400"
                            title="Remove from group"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Ungrouped reels */}
          {groupsViewData.ungrouped.length > 0 && (
            <div
              className="overflow-hidden rounded-xl"
              style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">
                Ungrouped ({groupsViewData.ungrouped.length})
              </div>
              {groupsViewData.ungrouped.map((row) => (
                <div
                  key={row.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[0.02]"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  onClick={() => { setSelectedPost(row); setOpenWithTranscript(false) }}
                >
                  {row.thumbnail_url || row.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.thumbnail_url ?? row.media_url ?? ''}
                      alt=""
                      width={36} height={36}
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                  )}
                  <span className="flex-1 truncate text-[#d1d5db]">{truncate(row.caption, 60) || <span className="text-[#4b5563]">No caption</span>}</span>
                  <span className="text-[12px] text-[#6b7280]">{fmtDate(row.posted_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setGroupModal({ postId: row.id }) }}
                    className="rounded px-2 py-0.5 text-[11px] text-[#6b7280] hover:bg-white/10 hover:text-[#9ca3af]"
                  >
                    Add to group
                  </button>
                </div>
              ))}
            </div>
          )}

          {groupsViewData.groupMap.size === 0 && groupsViewData.ungrouped.length === 0 && (
            <div className="py-16 text-center text-[14px] text-[#6b7280]">No reels match the current filter.</div>
          )}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────── */}
      {viewMode === 'table' && <div
        className="overflow-x-auto rounded-xl"
        style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {bulkMode && (
                <th className="w-10 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIds.size === paginated.length) setSelectedIds(new Set())
                      else setSelectedIds(new Set(paginated.map((r) => r.id)))
                    }}
                    className="flex items-center justify-center"
                  >
                    {selectedIds.size > 0 && selectedIds.size === paginated.length
                      ? <CheckSquare className="h-4 w-4 text-[#60a5fa]" />
                      : <Square      className="h-4 w-4 text-[#4b5563]" />
                    }
                  </button>
                </th>
              )}
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Thumb</th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Caption</th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Type</th>
              <Th col="posted_at"       sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="left">Date</Th>
              <Th col="views"           sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Views</Th>
              <Th col="reach"           sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Reach</Th>
              <Th col="like_count"      sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Likes</Th>
              <Th col="comments_count"  sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Comments</Th>
              <Th col="saved"           sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Saves</Th>
              <Th col="shares"          sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Shares</Th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Reposts</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Follows</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Avg Watch</th>
              <Th col="avg_watch_rate"  sortKey={sortKey} sortDir={sortDir} onClick={handleSort} title="Avg watch time ÷ video duration. How much of the reel people watched on average.">Avg Watch %</Th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Skip Rate</th>
              <Th col="engagement_rate"    sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Eng. Rate</Th>
              <Th col="save_rate"          sortKey={sortKey} sortDir={sortDir} onClick={handleSort}>Save Rate</Th>
              <Th col="profile_visit_rate" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} title="Profile visits ÷ Reach. % of reached accounts who visited your profile.">PV Rate</Th>
              <Th col="replay_rate"     sortKey={sortKey} sortDir={sortDir} onClick={handleSort} title="Views ÷ Reach. Above 100% means people are rewatching.">Replay Rate</Th>
              <Th col="hook_rate"       sortKey={sortKey} sortDir={sortDir} onClick={handleSort} title="Estimated % of accounts who saw this reel and chose to play it. Approximated from API data (views ÷ reach).">Hook Rate</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={10} />)
            ) : paginated.length === 0 ? (
              <EmptyState colSpan={colSpan} />
            ) : (
              paginated.map((row) => {
                const isReel          = row.media_type === 'VIDEO'
                const isSelected      = selectedIds.has(row.id)
                const thumb           = row.thumbnail_url ?? row.media_url
                const engRate         = calcEngagementRate(row)
                const saveRate        = calcSaveRate(row)
                const profileVisitRate = calcProfileVisitRate(row)
                const replayRate      = calcReplayRate(row)
                const avgWatchRate    = calcAvgWatchRate(row)
                const hookRate        = calcHookRate(row)

                return (
                  <tr
                    key={row.id}
                    className="group/row cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      backgroundColor: isSelected ? 'rgba(37,99,235,0.08)' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? 'rgba(37,99,235,0.08)' : ''
                    }}
                    onClick={() => handleRowClick(row)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ postId: row.id, x: e.clientX, y: e.clientY })
                    }}
                  >
                    {/* Bulk checkbox */}
                    {bulkMode && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center">
                          {isSelected
                            ? <CheckSquare className="h-4 w-4 text-[#60a5fa]" />
                            : <Square      className="h-4 w-4 text-[#4b5563]" />
                          }
                        </div>
                      </td>
                    )}

                    {/* Thumbnail */}
                    <td className="px-3 py-3">
                      <a
                        href={row.permalink ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative inline-block shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb} alt=""
                            width={50} height={50}
                            className="h-[50px] w-[50px] rounded-lg object-cover"
                            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                          />
                        ) : (
                          <div
                            className="flex h-[50px] w-[50px] items-center justify-center rounded-lg"
                            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <span className="text-[10px] text-[#4b5563]">—</span>
                          </div>
                        )}
                        {isReel && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                            <Play className="h-4 w-4 fill-white text-white" />
                          </div>
                        )}
                      </a>
                    </td>

                    {/* Caption */}
                    <td className="max-w-[220px] px-3 py-3">
                      <span className="block cursor-default text-[13px] text-[#d1d5db]" title={row.caption ?? ''}>
                        {row.caption
                          ? truncate(row.caption, 70)
                          : <span className="text-[#4b5563]">No caption</span>
                        }
                      </span>
                    </td>

                    {/* Type badges */}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={row.media_type} />
                        {row.is_trial && <TrialBadge />}
                        {row.reel_group_id && (
                          <span title="Part of a script group">
                            <Link2 className="h-3 w-3 text-[#60a5fa]" />
                          </span>
                        )}
                        {/* Transcript status dot — reels only */}
                        {isReel && (
                          <TranscriptDot
                            status={row.transcript_status}
                            onClick={(e) => handleTranscriptDotClick(e, row)}
                          />
                        )}
                        {/* Row menu */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setContextMenu({ postId: row.id, x: e.clientX, y: e.clientY })
                          }}
                          className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-white/10"
                          title="Row actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5 text-[#6b7280]" />
                        </button>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="whitespace-nowrap px-3 py-3 text-left text-[13px] text-[#9ca3af]">
                      {fmtDate(row.posted_at)}
                    </td>

                    {/* Views */}
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">
                      {isReel ? fmtNum(row.views) : <span className="text-[#4b5563]">—</span>}
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtNum(row.reach)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtNum(row.like_count)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtNum(row.comments_count)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtNum(row.saved)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtNum(row.shares)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtNum(row.reposts_count)}</td>

                    {/* Follows — inline-editable for reels */}
                    <td
                      className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]"
                      onClick={(e) => { if (isReel) e.stopPropagation() }}
                    >
                      {isReel ? (
                        editingCell?.rowId === row.id && editingCell.field === 'follows_count' ? (
                          <input
                            autoFocus
                            type="number" min="0"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(row.id, 'follows_count') } if (e.key === 'Escape') cancelEdit() }}
                            onBlur={() => commitEdit(row.id, 'follows_count')}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 rounded px-1.5 py-0.5 text-right text-[12px] text-[#f9fafb] outline-none"
                            style={{ backgroundColor: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.35)' }}
                            placeholder="0"
                          />
                        ) : (
                          <span
                            className="group inline-flex cursor-text items-center justify-end gap-1"
                            onClick={() => startEdit(row.id, 'follows_count', row.follows_count)}
                          >
                            {row.follows_count_manual && <Pencil className="h-2.5 w-2.5 shrink-0 text-[#6b7280]" />}
                            <span className="group-hover:text-[#93c5fd]">{fmtNum(row.follows_count)}</span>
                            {row.follows_count == null && <Pencil className="h-2.5 w-2.5 shrink-0 text-[#4b5563] opacity-0 group-hover:opacity-100" />}
                          </span>
                        )
                      ) : <span className="text-[#4b5563]">—</span>}
                    </td>

                    {/* Avg Watch — inline-editable for reels */}
                    <td
                      className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]"
                      onClick={(e) => { if (isReel) e.stopPropagation() }}
                    >
                      {isReel ? (
                        editingCell?.rowId === row.id && editingCell.field === 'avg_watch_time_ms' ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="number" min="0" step="0.1"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(row.id, 'avg_watch_time_ms') } if (e.key === 'Escape') cancelEdit() }}
                              onBlur={() => commitEdit(row.id, 'avg_watch_time_ms')}
                              onClick={(e) => e.stopPropagation()}
                              className="w-16 rounded px-1.5 py-0.5 text-right text-[12px] text-[#f9fafb] outline-none"
                              style={{ backgroundColor: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.35)' }}
                              placeholder="sec"
                            />
                            <span className="text-[10px] text-[#6b7280]">s</span>
                          </span>
                        ) : (
                          <span
                            className="group inline-flex cursor-text items-center justify-end gap-1"
                            onClick={() => startEdit(row.id, 'avg_watch_time_ms', row.avg_watch_time_ms)}
                          >
                            {row.avg_watch_time_manual && <Pencil className="h-2.5 w-2.5 shrink-0 text-[#6b7280]" />}
                            <span className="group-hover:text-[#93c5fd]">{fmtWatchTime(row.avg_watch_time_ms)}</span>
                            {row.avg_watch_time_ms == null && <Pencil className="h-2.5 w-2.5 shrink-0 text-[#4b5563] opacity-0 group-hover:opacity-100" />}
                          </span>
                        )
                      ) : <span className="text-[#4b5563]">—</span>}
                    </td>

                    {/* Avg Watch % — reels only, requires video_duration */}
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">
                      {isReel ? fmtPct(avgWatchRate) : <span className="text-[#4b5563]">—</span>}
                    </td>

                    {/* Skip Rate — inline-editable for reels */}
                    <td
                      className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]"
                      onClick={(e) => { if (isReel) e.stopPropagation() }}
                    >
                      {isReel ? (
                        editingCell?.rowId === row.id && editingCell.field === 'skip_rate' ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="number" min="0" max="100" step="0.1"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(row.id, 'skip_rate') } if (e.key === 'Escape') cancelEdit() }}
                              onBlur={() => commitEdit(row.id, 'skip_rate')}
                              onClick={(e) => e.stopPropagation()}
                              className="w-14 rounded px-1.5 py-0.5 text-right text-[12px] text-[#f9fafb] outline-none"
                              style={{ backgroundColor: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.35)' }}
                              placeholder="%"
                            />
                            <span className="text-[10px] text-[#6b7280]">%</span>
                          </span>
                        ) : (
                          <span
                            className="group inline-flex cursor-text items-center justify-end gap-1"
                            onClick={() => startEdit(row.id, 'skip_rate', row.skip_rate)}
                          >
                            {row.skip_rate_manual && <Pencil className="h-2.5 w-2.5 shrink-0 text-[#6b7280]" />}
                            <span className="group-hover:text-[#93c5fd]">{fmtPct(row.skip_rate)}</span>
                            {row.skip_rate == null && <Pencil className="h-2.5 w-2.5 shrink-0 text-[#4b5563] opacity-0 group-hover:opacity-100" />}
                          </span>
                        )
                      ) : <span className="text-[#4b5563]">—</span>}
                    </td>

                    {/* Engagement Rate */}
                    <td className="px-3 py-3 text-right font-mono text-[13px]">
                      <span style={{ color: engRate !== null && engRate >= 3 ? '#34d399' : '#d1d5db' }}>
                        {fmtPct(engRate)}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtPct(saveRate)}</td>

                    {/* Profile Visit Rate */}
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">{fmtPct(profileVisitRate)}</td>

                    {/* Replay Rate — views/reach, can exceed 100% */}
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">
                      {isReel ? fmtPct(replayRate) : <span className="text-[#4b5563]">—</span>}
                    </td>

                    {/* Hook Rate — views/reach, reels only */}
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#d1d5db]">
                      {isReel ? fmtPct(hookRate) : <span className="text-[#4b5563]">—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {!loading && sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-[#6b7280]">
            {sorted.length} posts · page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all disabled:opacity-30"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all disabled:opacity-30"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Analyze CTA ──────────────────────────────────────────────── */}
      {!loading && (
        <div className="flex justify-end px-1">
          <Link
            href="/dashboard/instagram/analysis"
            className="text-[13px] font-semibold transition-colors"
            style={{ color: '#60a5fa' }}
          >
            Analyze your content →
          </Link>
        </div>
      )}

      {/* ── Detail panel ─────────────────────────────────────────────── */}
      {selectedPost && (
        <PostDetailPanel
          post={selectedPost}
          averages={averages}
          initialTranscript={transcripts[selectedPost.id] ?? null}
          scrollToTranscript={openWithTranscript}
          onClose={() => { setSelectedPost(null); setOpenWithTranscript(false) }}
          onTranscribeStart={handleTranscribeStart}
          onTranscribed={handleTranscribed}
          onTranscribeFailed={handleTranscribeFailed}
        />
      )}

      {/* ── Context menu ─────────────────────────────────────────────── */}
      {contextMenu && (() => {
        const cmRow = mergedRows.find((r) => r.id === contextMenu.postId)
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
            />
            <div
              className="fixed z-50 overflow-hidden rounded-xl py-1 shadow-2xl"
              style={{
                top:             contextMenu.y,
                left:            contextMenu.x,
                backgroundColor: '#1e293b',
                border:          '1px solid rgba(255,255,255,0.10)',
                minWidth:        180,
              }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-[#d1d5db] hover:bg-white/[0.06]"
                onClick={() => { setGroupModal({ postId: contextMenu.postId }); setContextMenu(null) }}
              >
                <Link2 className="h-3.5 w-3.5 text-[#6b7280]" />
                {cmRow?.reel_group_id ? 'Change group' : 'Add to group'}
              </button>
              {cmRow?.reel_group_id && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-red-400 hover:bg-red-500/10"
                  onClick={() => { handleAssignGroup(contextMenu.postId, null) }}
                >
                  <X className="h-3.5 w-3.5" />
                  Remove from group
                </button>
              )}
            </div>
          </>
        )
      })()}

      {/* ── Group assignment modal ────────────────────────────────────── */}
      {groupModal && (
        <>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setGroupModal(null)}
          >
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl"
              style={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.10)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[14px] font-semibold text-[#f9fafb]">Assign to group</span>
                <button type="button" onClick={() => setGroupModal(null)}>
                  <X className="h-4 w-4 text-[#6b7280]" />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto px-3 py-2">
                {localGroups.length === 0 && (
                  <p className="px-2 py-3 text-[13px] text-[#6b7280]">No groups yet. Create one below.</p>
                )}
                {localGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleAssignGroup(groupModal.postId, g.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-[#d1d5db] hover:bg-white/[0.06]"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
                    {g.name}
                  </button>
                ))}
              </div>
              {/* Create new group */}
              <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Create new group</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Group name…"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndAssign(groupModal.postId) }}
                    className="flex-1 rounded-lg px-3 py-1.5 text-[13px] text-[#f9fafb] outline-none placeholder:text-[#4b5563] focus:ring-1 focus:ring-[#2563eb]/50"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                  />
                  <button
                    type="button"
                    disabled={!newGroupName.trim() || creatingGroup}
                    onClick={() => handleCreateAndAssign(groupModal.postId)}
                    className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
                    style={{ backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.30)' }}
                  >
                    {creatingGroup ? '…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Bulk action bar ───────────────────────────────────────────── */}
      {bulkMode && selectedIds.size > 0 && (() => {
        const allSelected   = Array.from(selectedIds).map((id) => mergedRows.find((r) => r.id === id)).filter((r): r is PostRow => r !== undefined)
        const videoCount    = allSelected.filter((r) => r.media_type === 'VIDEO' && r.transcript_status !== 'done').length
        const nonVideoCount = allSelected.filter((r) => r.media_type !== 'VIDEO').length
        const alreadyDone   = allSelected.filter((r) => r.media_type === 'VIDEO' && r.transcript_status === 'done').length
        const overLimit     = videoCount > 20

        return (
          <div
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 shadow-2xl"
            style={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.10)', minWidth: 320 }}
          >
            {bulkTranscribeStatus === 'running' ? (
              /* ── Transcription in progress ── */
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-2 w-2 animate-pulse rounded-full"
                  style={{ backgroundColor: '#f59e0b', flexShrink: 0 }}
                />
                <span className="text-[13px] font-semibold text-[#f9fafb]">
                  Transcribing {bulkTranscribeProgress.current}/{bulkTranscribeProgress.total}…
                </span>
              </div>
            ) : bulkTranscribeStatus === 'done' ? (
              /* ── Transcription complete ── */
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] font-semibold text-[#f9fafb]">
                  {bulkTranscribeProgress.failed.length === 0
                    ? `✓ Transcribed all ${bulkTranscribeProgress.completed.length} reels.`
                    : `Transcribed ${bulkTranscribeProgress.completed.length}/${bulkTranscribeProgress.total} reels. ${bulkTranscribeProgress.failed.length} failed.`
                  }
                </span>
                {bulkTranscribeProgress.failed.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}
                  >
                    Retry Failed
                  </button>
                )}
                <button
                  type="button"
                  onClick={exitBulkMode}
                  className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all hover:opacity-80"
                  style={{ backgroundColor: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.25)' }}
                >
                  Done
                </button>
              </div>
            ) : (
              /* ── Idle — show action buttons ── */
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] font-semibold text-[#f9fafb]">
                    {selectedIds.size} post{selectedIds.size !== 1 ? 's' : ''} selected
                  </span>

                  <div className="mx-1 h-4 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />

                  <button
                    type="button"
                    onClick={() => handleBulkTrial(true)}
                    className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(251,146,60,0.18)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)' }}
                  >
                    Mark as Trial
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBulkTrial(false)}
                    className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    Remove Trial
                  </button>

                  <button
                    type="button"
                    onClick={handleBulkTranscribe}
                    disabled={overLimit || videoCount === 0}
                    className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ backgroundColor: 'rgba(124,58,237,0.18)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.28)' }}
                  >
                    Transcribe Selected
                  </button>

                  <button
                    type="button"
                    onClick={exitBulkMode}
                    className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-all"
                    style={{ color: '#6b7280' }}
                  >
                    Cancel
                  </button>
                </div>

                {/* Validation messages */}
                {overLimit && (
                  <p className="mt-2 text-[12px]" style={{ color: '#f87171' }}>
                    Maximum 20 reels per batch. Please deselect some.
                  </p>
                )}
                {!overLimit && nonVideoCount > 0 && (
                  <p className="mt-2 text-[12px]" style={{ color: '#fbbf24' }}>
                    {nonVideoCount} selected post{nonVideoCount !== 1 ? 's are' : ' is'} not a reel and will be skipped.
                    {alreadyDone > 0 && ` ${alreadyDone} already transcribed.`}
                  </p>
                )}
                {!overLimit && nonVideoCount === 0 && alreadyDone > 0 && (
                  <p className="mt-2 text-[12px]" style={{ color: '#6b7280' }}>
                    {alreadyDone} already transcribed — will be skipped.
                  </p>
                )}
                {bulkTranscribeLimitMsg && (
                  <p className="mt-2 text-[12px]" style={{ color: '#f87171' }}>
                    {bulkTranscribeLimitMsg}
                  </p>
                )}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
