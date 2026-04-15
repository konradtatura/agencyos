/**
 * GET /api/metrics/funnel-branches
 *
 * Returns per-step visitor counts for the creator's funnel config.
 *
 * Query params:
 *   funnel_id: string           — which funnel from funnel_config (defaults to first)
 *   range:     today|7d|30d|month|all|custom  (default: 30d)
 *   from:      ISO string       — custom range start
 *   to:        ISO string       — custom range end
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FunnelStep {
  label: string
  path:  string
}

interface FunnelBranch {
  id:    string
  label: string
  color: string
  steps: FunnelStep[]
}

interface FunnelDef {
  id:         string
  name:       string
  entry_path: string
  branches:   FunnelBranch[]
}

interface FunnelConfig {
  funnels?: FunnelDef[]
}

export interface FunnelBranchesResponse {
  all_funnels:  { id: string; name: string }[]
  funnel_id:    string
  funnel_name:  string
  entry_path:   string
  entry_visits: number
  branches: Array<{
    id:    string
    label: string
    color: string
    steps: Array<{
      label:  string
      path:   string
      visits: number
    }>
  }>
}

// ── Date range helper ─────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

function resolveDateRange(
  range: string,
  fromParam?: string | null,
  toParam?: string | null
): { from: Date; to: Date } {
  const now = new Date()
  switch (range) {
    case 'today':  return { from: startOfDay(now), to: now }
    case '7d':     return { from: addDays(startOfDay(now), -7), to: now }
    case 'month':  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: now }
    case 'all':    return { from: new Date('2020-01-01T00:00:00Z'), to: now }
    case 'custom': return {
      from: fromParam ? new Date(fromParam) : addDays(startOfDay(now), -30),
      to:   toParam   ? new Date(toParam)   : now,
    }
    case '30d':
    default:       return { from: addDays(startOfDay(now), -30), to: now }
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId: authCreatorId, role } = auth
  const params = req.nextUrl.searchParams
  const range     = params.get('range') ?? '30d'
  const fromParam = params.get('from')
  const toParam   = params.get('to')

  const creatorId = (role === 'super_admin' ? params.get('creator_id') : null) ?? authCreatorId
  if (!creatorId) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 })
  }

  // ── 1. Fetch funnel config ─────────────────────────────────────────────────
  const { data: profileRow } = await admin
    .from('creator_profiles')
    .select('funnel_config')
    .eq('id', creatorId)
    .maybeSingle()

  const config = (profileRow?.funnel_config ?? {}) as FunnelConfig
  const funnels: FunnelDef[] = config.funnels ?? []

  const all_funnels = funnels.map(f => ({ id: f.id, name: f.name }))

  // Pick requested funnel (or first)
  const funnelIdParam = params.get('funnel_id')
  const funnel = funnelIdParam
    ? (funnels.find(f => f.id === funnelIdParam) ?? funnels[0])
    : funnels[0]

  if (!funnel) {
    return NextResponse.json({
      all_funnels,
      funnel_id:    '',
      funnel_name:  '',
      entry_path:   '',
      entry_visits: 0,
      branches:     [],
    } satisfies FunnelBranchesResponse)
  }

  // ── 2. Collect all paths we care about ────────────────────────────────────
  const allPaths: string[] = [funnel.entry_path]
  for (const branch of funnel.branches) {
    for (const step of branch.steps) {
      allPaths.push(step.path)
    }
  }

  // ── 3. Fetch page views in date range ─────────────────────────────────────
  const { from, to } = resolveDateRange(range, fromParam, toParam)

  const { data: pageviews } = await admin
    .from('funnel_pageviews')
    .select('page_path, session_id')
    .eq('creator_id', creatorId)
    .gte('visited_at', from.toISOString())
    .lte('visited_at', to.toISOString())
    .in('page_path', allPaths)

  // ── 4. Count unique sessions per path ─────────────────────────────────────
  const uniqueByPath: Record<string, Set<string>> = {}
  for (const row of (pageviews ?? [])) {
    if (!uniqueByPath[row.page_path]) uniqueByPath[row.page_path] = new Set()
    uniqueByPath[row.page_path].add(row.session_id)
  }

  const visitsFor = (path: string) => uniqueByPath[path]?.size ?? 0

  // ── 5. Build response ──────────────────────────────────────────────────────
  const entry_visits = visitsFor(funnel.entry_path)

  const branches = funnel.branches.map(branch => ({
    id:    branch.id,
    label: branch.label,
    color: branch.color,
    steps: branch.steps.map(step => ({
      label:  step.label,
      path:   step.path,
      visits: visitsFor(step.path),
    })),
  }))

  const response: FunnelBranchesResponse = {
    all_funnels,
    funnel_id:    funnel.id,
    funnel_name:  funnel.name,
    entry_path:   funnel.entry_path,
    entry_visits,
    branches,
  }

  return NextResponse.json(response)
}
