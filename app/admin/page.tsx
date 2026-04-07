import { createAdminClient } from '@/lib/supabase/admin'
import { isTokenExpired } from '@/lib/instagram/token'
import { AlertTriangle, TrendingUp, DollarSign, Phone, Target, Users, Calendar } from 'lucide-react'
import Link from 'next/link'
import ImpersonateButton from './impersonate-button'

// ── Types ─────────────────────────────────────────────────────────────────────

type IgAccount = {
  username:        string | null
  followers_count: number | null
  updated_at:      string
}

type Integration = {
  platform:   string
  status:     string
  expires_at: string | null
}

type CreatorRow = {
  id:                  string
  name:                string
  niche:               string | null
  ghl_location_id:     string | null
  onboarding_complete: boolean
  created_at:          string
  users:               { email: string; full_name: string | null } | null
  integrations:        Integration[] | null
  instagram_accounts:  IgAccount | null
}

type Alert = {
  creatorId:   string
  creatorName: string
  issue:       string
  severity:    'red' | 'amber'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: 'rgba(37,99,235,0.2)',   text: '#60a5fa' },
  { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
  { bg: 'rgba(16,185,129,0.2)', text: '#34d399' },
  { bg: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
  { bg: 'rgba(236,72,153,0.2)', text: '#f472b6' },
]

function avatarColors(seed: string) {
  return AVATAR_PALETTE[seed.charCodeAt(0) % AVATAR_PALETTE.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1_000)     return n.toLocaleString()
  return String(n)
}

function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

function relativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60)  return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr  < 24)  return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function getIgState(integrations: Integration[] | null): 'connected' | 'expiring' | 'disconnected' {
  const ig = integrations?.find((i) => i.platform === 'instagram' && i.status === 'active')
  if (!ig) return 'disconnected'
  if (isTokenExpired(ig.expires_at)) return 'expiring'
  return 'connected'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  label,
  value,
  color = '#60a5fa',
}: {
  icon: React.ComponentType<{ className?: string; color?: string }>
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-5 py-4 flex-1"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <Icon className="h-4 w-4" color={color} />
      </div>
      <div>
        <p className="text-[11px] font-medium text-[#6b7280]">{label}</p>
        <p className="font-mono text-[18px] font-bold" style={{ color }}>{value}</p>
      </div>
    </div>
  )
}

function RoleBadge({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: (style.color as string) }} />
      {label}
    </span>
  )
}

function HealthDot({ issues }: { issues: number }) {
  const color = issues === 0 ? '#10b981' : issues === 1 ? '#f59e0b' : '#ef4444'
  const title = issues === 0 ? 'Healthy' : issues === 1 ? '1 issue' : `${issues} issues`
  return (
    <div title={title} className="flex items-center gap-1.5">
      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[11px]" style={{ color }}>{title}</span>
    </div>
  )
}

// ── Creator card ──────────────────────────────────────────────────────────────

function CreatorCard({
  creator,
  metrics,
}: {
  creator: CreatorRow
  metrics: { mrr: number; close_rate: number | null; active_leads: number; last_lead_at: string | null }
}) {
  const colors   = avatarColors(creator.name)
  const initials = getInitials(creator.name)
  const email    = creator.users?.email ?? '—'
  const igState  = getIgState(creator.integrations)

  const igAccount = Array.isArray(creator.instagram_accounts)
    ? ((creator.instagram_accounts as IgAccount[])[0] ?? null)
    : creator.instagram_accounts

  // Count issues for health dot
  let issues = 0
  if (igState === 'disconnected') issues++
  if (!creator.ghl_location_id)   issues++
  if (metrics.close_rate !== null && metrics.close_rate < 20) issues++
  if (metrics.last_lead_at) {
    const daysSince = (Date.now() - new Date(metrics.last_lead_at).getTime()) / 86_400_000
    if (daysSince > 7) issues++
  } else {
    issues++ // no leads ever
  }

  const IG_STYLES = {
    connected:    { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', label: 'IG Connected'  },
    expiring:     { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'IG Expiring'   },
    disconnected: { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', label: 'No IG'         },
  }
  const igStyle = IG_STYLES[igState]

  return (
    <div
      className="flex flex-col rounded-xl p-5"
      style={{
        backgroundColor: '#111827',
        border: issues >= 2
          ? '1px solid rgba(239,68,68,0.2)'
          : issues === 1
          ? '1px solid rgba(245,158,11,0.2)'
          : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {initials}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#f9fafb]">{creator.name}</p>
            {creator.niche && (
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: 'rgba(37,99,235,0.1)', color: '#60a5fa' }}
              >
                {creator.niche}
              </span>
            )}
          </div>
        </div>
        <HealthDot issues={issues} />
      </div>

      {/* Email + date */}
      <p className="mb-0.5 text-[12px] text-[#9ca3af]">{email}</p>
      <p className="mb-3 text-[11px] text-[#4b5563]">Added {formatDate(creator.created_at)}</p>

      {/* Status badges */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <RoleBadge
          label={creator.onboarding_complete ? 'Active' : 'Pending Setup'}
          style={creator.onboarding_complete
            ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }
            : { backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24' }
          }
        />
        <RoleBadge
          label={igStyle.label}
          style={{ backgroundColor: igStyle.bg, color: igStyle.color }}
        />
        <RoleBadge
          label={creator.ghl_location_id ? 'GHL Connected' : 'No GHL'}
          style={creator.ghl_location_id
            ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }
            : { backgroundColor: 'rgba(107,114,128,0.1)', color: '#6b7280' }
          }
        />
      </div>

      {/* IG followers */}
      {igAccount && igState !== 'disconnected' && (
        <div
          className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="#6b7280" strokeWidth="1.75" />
            <circle cx="12" cy="12" r="4.5" stroke="#6b7280" strokeWidth="1.75" />
            <circle cx="17.5" cy="6.5" r="1" fill="#6b7280" />
          </svg>
          <span className="text-[11px] text-[#9ca3af]">@{igAccount.username}</span>
          {igAccount.followers_count != null && (
            <>
              <span className="text-[#374151]">·</span>
              <span className="font-mono text-[11px] font-semibold text-[#d1d5db]">
                {fmtFollowers(igAccount.followers_count)}
              </span>
            </>
          )}
          <span className="ml-auto text-[10px] text-[#4b5563]">{relativeTime(igAccount.updated_at)}</span>
        </div>
      )}

      {/* Metric pills */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: 'MRR',          value: fmtCurrency(metrics.mrr),              color: '#10b981' },
          { label: 'Close Rate',   value: metrics.close_rate !== null ? `${metrics.close_rate}%` : '—', color: metrics.close_rate !== null && metrics.close_rate < 20 ? '#ef4444' : '#f9fafb' },
          { label: 'Active Leads', value: metrics.active_leads,                  color: '#f9fafb' },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg px-2 py-2 text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="font-mono text-[14px] font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="text-[10px] text-[#4b5563]">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-auto flex gap-2">
        <ImpersonateButton creatorId={creator.id} />
        <Link
          href={`/admin/creators`}
          className="flex items-center justify-center rounded-lg px-3 py-2 text-[12px] font-medium text-[#9ca3af] transition-colors hover:text-[#f9fafb]"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
        >
          Edit
        </Link>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const admin = createAdminClient()

  const now      = new Date()
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const today    = now.toISOString().slice(0, 10)
  const since7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const DEAD_STAGES = ['dead', 'closed_lost', 'disqualified']

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [creatorsRes, salesRes, leadsRes, historyRes] = await Promise.all([
    admin
      .from('creator_profiles')
      .select(`
        id, name, niche, ghl_location_id, onboarding_complete, created_at,
        users!user_id ( email, full_name ),
        integrations ( platform, status, expires_at ),
        instagram_accounts ( username, followers_count, updated_at )
      `)
      .order('created_at', { ascending: false }),

    admin
      .from('sales')
      .select('creator_id, amount, payment_type')
      .gte('sale_date', mtdStart)
      .lte('sale_date', today),

    admin
      .from('leads')
      .select('creator_id, stage, created_at')
      .order('created_at', { ascending: false }),

    admin
      .from('lead_stage_history')
      .select('to_stage')
      .eq('to_stage', 'call_booked')
      .gte('changed_at', `${mtdStart}T00:00:00Z`),
  ])

  const creators = (creatorsRes.data ?? []) as unknown as CreatorRow[]
  const sales    = salesRes.data   ?? []
  const leads    = leadsRes.data   ?? []
  const history  = historyRes.data ?? []

  // ── Agency rollup ─────────────────────────────────────────────────────────
  const total_mrr = sales
    .filter((s) => s.payment_type === 'recurring')
    .reduce((sum, s) => sum + Number(s.amount), 0)

  const cash_collected_mtd = sales
    .reduce((sum, s) => sum + Number(s.amount), 0)

  const active_leads_count = leads.filter((l) => !DEAD_STAGES.includes(l.stage)).length

  const booked_calls_mtd = history.length

  // Per-creator close rates for avg
  const perCreatorLeads: Record<string, { showed: number; closed_won: number; booked: number }> = {}
  for (const l of leads) {
    const id = l.creator_id as string
    if (!perCreatorLeads[id]) perCreatorLeads[id] = { showed: 0, closed_won: 0, booked: 0 }
    if (l.stage === 'showed')     perCreatorLeads[id].showed++
    if (l.stage === 'closed_won') perCreatorLeads[id].closed_won++
    if (['call_booked','showed','closed_won','closed_lost','no_show'].includes(l.stage))
      perCreatorLeads[id].booked++
  }

  const closeRates = Object.values(perCreatorLeads)
    .map((c) => c.showed > 0 ? (c.closed_won / c.showed) * 100 : null)
    .filter((r): r is number => r !== null)

  const showRates = Object.values(perCreatorLeads)
    .map((c) => c.booked > 0 ? ((c.showed + c.closed_won) / c.booked) * 100 : null)
    .filter((r): r is number => r !== null)

  const avg_close_rate = closeRates.length > 0
    ? Math.round(closeRates.reduce((a, b) => a + b, 0) / closeRates.length * 10) / 10 : 0
  const avg_show_rate  = showRates.length > 0
    ? Math.round(showRates.reduce((a, b) => a + b, 0) / showRates.length * 10) / 10  : 0

  // ── Per-creator metrics ───────────────────────────────────────────────────
  const creatorMetrics = new Map<string, {
    mrr:          number
    close_rate:   number | null
    active_leads: number
    last_lead_at: string | null
  }>()

  for (const creator of creators) {
    const cSales = sales.filter((s) => s.creator_id === creator.id)
    const cLeads = leads.filter((l) => l.creator_id === creator.id)

    const mrr = cSales
      .filter((s) => s.payment_type === 'recurring')
      .reduce((sum, s) => sum + Number(s.amount), 0)

    const cStats = perCreatorLeads[creator.id] ?? { showed: 0, closed_won: 0, booked: 0 }
    const close_rate = cStats.showed > 0
      ? Math.round((cStats.closed_won / cStats.showed) * 100 * 10) / 10
      : null

    const active_leads = cLeads.filter((l) => !DEAD_STAGES.includes(l.stage)).length

    const recentLeads = cLeads.filter((l) => !DEAD_STAGES.includes(l.stage))
    const last_lead_at = recentLeads.length > 0 ? recentLeads[0].created_at as string : null

    creatorMetrics.set(creator.id, { mrr, close_rate, active_leads, last_lead_at })
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts: Alert[] = []

  for (const creator of creators) {
    const igState = getIgState(creator.integrations)
    const metrics = creatorMetrics.get(creator.id)!

    if (igState === 'disconnected') {
      alerts.push({ creatorId: creator.id, creatorName: creator.name, issue: 'Instagram not connected', severity: 'red' })
    } else if (igState === 'expiring') {
      alerts.push({ creatorId: creator.id, creatorName: creator.name, issue: 'Instagram token expiring', severity: 'amber' })
    }

    if (!creator.ghl_location_id) {
      alerts.push({ creatorId: creator.id, creatorName: creator.name, issue: 'GHL not configured', severity: 'amber' })
    }

    if (metrics.last_lead_at) {
      const daysSince = (Date.now() - new Date(metrics.last_lead_at).getTime()) / 86_400_000
      if (daysSince > 7) {
        alerts.push({ creatorId: creator.id, creatorName: creator.name, issue: 'No active leads in 7 days', severity: 'amber' })
      }
    } else if (creator.onboarding_complete) {
      alerts.push({ creatorId: creator.id, creatorName: creator.name, issue: 'No leads created yet', severity: 'amber' })
    }

    if (metrics.close_rate !== null && metrics.close_rate < 20 && metrics.active_leads > 0) {
      alerts.push({ creatorId: creator.id, creatorName: creator.name, issue: `Low close rate (${metrics.close_rate}%)`, severity: 'red' })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const rollupStats = [
    { icon: DollarSign, label: 'Total MRR',          value: fmtCurrency(total_mrr),        color: '#10b981' },
    { icon: DollarSign, label: 'Cash Collected MTD',  value: fmtCurrency(cash_collected_mtd), color: '#60a5fa' },
    { icon: Target,     label: 'Avg Close Rate',      value: `${avg_close_rate}%`,          color: '#a78bfa' },
    { icon: TrendingUp, label: 'Avg Show Rate',       value: `${avg_show_rate}%`,           color: '#fbbf24' },
    { icon: Users,      label: 'Active Leads',        value: active_leads_count,            color: '#f9fafb' },
    { icon: Calendar,   label: 'Booked Calls MTD',    value: booked_calls_mtd,              color: '#34d399' },
  ]

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-[#f9fafb]">Agency Overview</h1>
        <p className="mt-1 text-[13px] text-[#6b7280]">
          {creators.length} creator{creators.length !== 1 ? 's' : ''} · month-to-date
        </p>
      </div>

      {/* Rollup stat pills */}
      <div className="mb-8 flex flex-wrap gap-3">
        {rollupStats.map((s) => (
          <StatPill key={s.label} icon={s.icon} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      {/* Creator cards grid */}
      {creators.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Users className="mb-3 h-8 w-8 text-[#374151]" />
          <p className="text-[14px] font-medium text-[#9ca3af]">No creators yet</p>
          <p className="mt-1 text-[12px] text-[#4b5563]">
            <Link href="/admin/creators" className="text-[#2563eb] hover:underline">Add your first creator</Link> to get started.
          </p>
        </div>
      ) : (
        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {creators.map((creator) => (
            <CreatorCard
              key={creator.id}
              creator={creator}
              metrics={creatorMetrics.get(creator.id)!}
            />
          ))}
        </div>
      )}

      {/* Alerts panel */}
      {alerts.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
            <h2 className="text-[15px] font-semibold text-[#f9fafb]">Alerts</h2>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
            >
              {alerts.length}
            </span>
          </div>
          <div
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Creator', 'Issue', 'Severity'].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4b5563]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {alerts.map((alert, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 text-[13px] font-medium text-[#f9fafb]">
                      {alert.creatorName}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[#9ca3af]">
                      {alert.issue}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={alert.severity === 'red'
                          ? { backgroundColor: 'rgba(239,68,68,0.12)',   color: '#f87171' }
                          : { backgroundColor: 'rgba(245,158,11,0.12)',  color: '#fbbf24' }
                        }
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: alert.severity === 'red' ? '#ef4444' : '#f59e0b' }}
                        />
                        {alert.severity === 'red' ? 'Critical' : 'Warning'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alerts.length === 0 && creators.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl px-5 py-4"
          style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <div className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
          <p className="text-[13px] font-medium text-[#10b981]">
            All {creators.length} creator{creators.length !== 1 ? 's' : ''} operating normally — no alerts.
          </p>
        </div>
      )}
    </div>
  )
}
