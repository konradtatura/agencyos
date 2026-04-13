/**
 * GET /api/metrics/funnel-branches
 *
 * Query params:
 *   funnel_id: string  — which funnel to load (defaults to first in config)
 *   range:     today | 7d | 30d | month | all | custom
 *   from:      ISO string (custom range only)
 *   to:        ISO string (custom range only)
 *
 * Returns entry_visits + per-branch per-step unique-session counts,
 * plus all_funnels list from the creator's config for dropdown use.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── Config types ───────────────────────────────────────────────────────────

interface ConfigStep   { label: string; path: string }
interface ConfigBranch { id: string; label: string; color: string; steps: ConfigStep[] }
interface ConfigFunnel { id: string; name: string; entry_path: string; branches: ConfigBranch[] }
interface FunnelConfig { funnels: ConfigFunnel[] }

// ── Response types ─────────────────────────────────────────────────────────

export interface BranchStep   { label: string; path: string; visits: number }
export interface BranchResult { id: string; label: string; color: string; steps: BranchStep[] }

export interface FunnelBranchesResponse {
  all_funnels:  { id: string; name: string }[]
  funnel_id:    string
  funnel_name:  string
  entry_path:   string
  entry_visits: number
  branches:     BranchResult[]
}

const EMPTY: FunnelBranchesResponse = {
  all_funnels: [], funnel_id: '', funnel_name: '',
  entry_path: '', entry_visits: 0, branches: [],
}

// ── Date helpers ───────────────────────────────────────────────────────────

function subDays(d: Date, n: number)  { return new Date(d.getTime() - n * 86_400_000) }
function startOfDay(d: Date)          { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function startOfMonth(d: Date)        { return new Date(d.getFullYear(), d.getMonth(), 1) }

function parseDateRange(range: string, from?: string | null, to?: string | null) {
  const now = new Date()
  switch (range) {
    case 'today':  return { fromDate: startOfDay(now),       toDate: now }
    case '7d':     return { fromDate: subDays(now, 7),       toDate: now }
    case 'month':  return { fromDate: startOfMonth(now),     toDate: now }
    case 'all':    return { fromDate: new Date('2020-01-01'), toDate: now }
    case 'custom': return {
      fromDate: from ? new Date(from) : subDays(now, 30),
      toDate:   to   ? new Date(to)   : now,
    }
    default:       return { fromDate: subDays(now, 30), toDate: now }
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const resolved = await resolveCrmUser()
  if ('error' in resolved) return resolved.error

  const { admin, userId, role, creatorId: directCreatorId } = resolved

  // Resolve creator (same pattern as /api/metrics/funnel)
  let creatorId: string | null = directCreatorId
  if (role === 'super_admin') {
    const param = req.nextUrl.searchParams.get('creator_id')
    if (param) {
      creatorId = param
    } else {
      const { data: first } = await admin
        .from('creator_profiles')
        .select('id')
        .order('created_at')
        .limit(1)
        .maybeSingle()
      creatorId = first?.id ?? null
    }
  }
  if (role === 'setter' || role === 'closer') {
    const { data: member } = await admin
      .from('team_members')
      .select('creator_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    creatorId = member?.creator_id ?? null
  }

  if (!creatorId) return NextResponse.json(EMPTY satisfies FunnelBranchesResponse)

  // Load funnel config
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('funnel_config')
    .eq('id', creatorId)
    .maybeSingle()

  const config   = profile?.funnel_config as FunnelConfig | null | undefined
  const funnels  = config?.funnels ?? []

  if (funnels.length === 0) {
    return NextResponse.json(EMPTY satisfies FunnelBranchesResponse)
  }

  // Select funnel
  const funnelIdParam = req.nextUrl.searchParams.get('funnel_id')
  const funnel = (funnelIdParam
    ? funnels.find(f => f.id === funnelIdParam)
    : null) ?? funnels[0]

  // Parse date range
  const range = req.nextUrl.searchParams.get('range') ?? '30d'
  const from  = req.nextUrl.searchParams.get('from')
  const to    = req.nextUrl.searchParams.get('to')
  const { fromDate, toDate } = parseDateRange(range, from, to)

  // Collect all relevant paths
  const allPaths = [
    funnel.entry_path,
    ...funnel.branches.flatMap(b => b.steps.map(s => s.path)),
  ]
  const uniquePaths = Array.from(new Set(allPaths))

  // Fetch pageview rows matching this funnel name OR untagged rows (funnel_name IS NULL)
  const { data: rows } = await admin
    .from('funnel_pageviews')
    .select('page_path, session_id')
    .eq('creator_id', creatorId)
    .in('page_path', uniquePaths)
    .gte('visited_at', fromDate.toISOString())
    .lte('visited_at', toDate.toISOString())
    .or(`funnel_name.eq.${funnel.name},funnel_name.is.null`)

  const filtered = rows ?? []

  // Build path → unique session count map
  const pathSessions = new Map<string, Set<string>>()
  for (const row of filtered) {
    const path = row.page_path as string
    const sess = row.session_id as string
    if (!pathSessions.has(path)) pathSessions.set(path, new Set())
    pathSessions.get(path)!.add(sess)
  }

  const visits = (path: string) => pathSessions.get(path)?.size ?? 0

  // Build response
  const entry_visits = visits(funnel.entry_path)

  const branches: BranchResult[] = funnel.branches.map(branch => ({
    id:    branch.id,
    label: branch.label,
    color: branch.color,
    steps: branch.steps.map(step => ({
      label:  step.label,
      path:   step.path,
      visits: visits(step.path),
    })),
  }))

  return NextResponse.json({
    all_funnels:  funnels.map(f => ({ id: f.id, name: f.name })),
    funnel_id:    funnel.id,
    funnel_name:  funnel.name,
    entry_path:   funnel.entry_path,
    entry_visits,
    branches,
  } satisfies FunnelBranchesResponse)
}
