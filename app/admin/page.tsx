import { createAdminClient } from '@/lib/supabase/admin'
import { isTokenExpired } from '@/lib/instagram/token'
import { DollarSign, Phone, Target, TrendingUp, Users, Calendar, CreditCard, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import AlertsStrip, { type AdminAlert } from './alerts-strip'
import CreatorGrid, {
  type SerializedCreator,
  type CreatorMetrics,
  type HealthScore,
  type OutstandingData,
} from './creator-grid'

// ── Types ─────────────────────────────────────────────────────────────────────

type Integration = { platform: string; status: string; expires_at: string | null }

type CreatorRow = {
  id:                  string
  name:                string
  niche:               string | null
  ghl_location_id:     string | null
  onboarding_complete: boolean
  created_at:          string
  users:               { email: string; full_name: string | null } | null
  integrations:        Integration[] | null
  instagram_accounts:  { username: string | null; followers_count: number | null; updated_at: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function getIgState(integrations: Integration[] | null): 'connected' | 'expiring' | 'disconnected' {
  const ig = integrations?.find(i => i.platform === 'instagram' && i.status === 'active')
  if (!ig) return 'disconnected'
  if (isTokenExpired(ig.expires_at)) return 'expiring'
  return 'connected'
}

function wowDelta(curr: number, prev: number): { pct: number; up: boolean } | null {
  if (prev === 0) return null
  const pct = Math.round(((curr - prev) / prev) * 100)
  return { pct: Math.abs(pct), up: curr >= prev }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RollupChip({
  icon: Icon,
  label,
  value,
  color,
  delta,
}: {
  icon: React.ComponentType<{ className?: string; color?: string }>
  label: string
  value: string | number
  color: string
  delta?: { pct: number; up: boolean } | null
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3.5 flex-1 min-w-[140px]"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="rounded-lg p-2 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <Icon className="h-4 w-4" color={color} />
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-medium text-[#6b7280] truncate">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="font-mono text-[17px] font-bold leading-tight" style={{ color }}>{value}</p>
          {delta && (
            <span
              className="text-[10px] font-semibold"
              style={{ color: delta.up ? '#34d399' : '#f87171' }}
            >
              {delta.up ? '↑' : '↓'}{delta.pct}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const admin = createAdminClient()

  const now         = new Date()
  const mtdStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const today       = now.toISOString().slice(0, 10)
  const curr7dStart = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const prev7dStart = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  const overdue7d   = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

  const DEAD_STAGES = ['dead', 'closed_lost', 'disqualified']

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    creatorsRes,
    salesRes,
    leadsRes,
    historyMtdRes,
    prev7dSalesRes,
    curr7dHistRes,
    prev7dHistRes,
    instalOutstandingRes,
    instalOverdueRes,
    instalDueTodayRes,
    dmsRes,
  ] = await Promise.all([
    // Creators with relations
    admin
      .from('creator_profiles')
      .select(`
        id, name, niche, ghl_location_id, onboarding_complete, created_at,
        users!user_id ( email, full_name ),
        integrations ( platform, status, expires_at ),
        instagram_accounts ( username, followers_count, updated_at )
      `)
      .order('created_at', { ascending: false }),

    // Sales MTD (with sale_date for curr-7d slice)
    admin
      .from('sales')
      .select('creator_id, amount, payment_type, sale_date')
      .gte('sale_date', mtdStart)
      .lte('sale_date', today),

    // All leads
    admin
      .from('leads')
      .select('creator_id, stage, created_at')
      .order('created_at', { ascending: false }),

    // Booked calls MTD (for rollup count)
    admin
      .from('lead_stage_history')
      .select('to_stage')
      .eq('to_stage', 'call_booked')
      .gte('changed_at', `${mtdStart}T00:00:00Z`),

    // Sales prev 7d (for WoW delta)
    admin
      .from('sales')
      .select('amount')
      .gte('sale_date', prev7dStart)
      .lt('sale_date', curr7dStart),

    // Booked calls curr 7d (for WoW delta)
    admin
      .from('lead_stage_history')
      .select('to_stage')
      .eq('to_stage', 'call_booked')
      .gte('changed_at', `${curr7dStart}T00:00:00Z`),

    // Booked calls prev 7d (for WoW delta)
    admin
      .from('lead_stage_history')
      .select('to_stage')
      .eq('to_stage', 'call_booked')
      .gte('changed_at', `${prev7dStart}T00:00:00Z`)
      .lt('changed_at', `${curr7dStart}T00:00:00Z`),

    // Outstanding instalments per creator (non-paid, due within 30d)
    admin
      .from('payment_instalments')
      .select('creator_id, amount, status, due_date')
      .in('status', ['pending', 'overdue'])
      .lte('due_date', new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)),

    // Overdue 7+ days (for red alert)
    admin
      .from('payment_instalments')
      .select('creator_id, amount, due_date')
      .eq('status', 'overdue')
      .lt('due_date', overdue7d),

    // Due today (for amber alert)
    admin
      .from('payment_instalments')
      .select('creator_id, amount')
      .eq('status', 'pending')
      .eq('due_date', today),

    // DMs MTD (active conversations)
    admin
      .from('dm_conversations')
      .select('creator_id, last_message_at')
      .gte('last_message_at', `${mtdStart}T00:00:00Z`),
  ])

  const creators    = (creatorsRes.data ?? []) as unknown as CreatorRow[]
  const sales       = salesRes.data   ?? []
  const leads       = leadsRes.data   ?? []
  const historyMtd  = historyMtdRes.data  ?? []
  const prev7dSales = prev7dSalesRes.data ?? []
  const curr7dHist  = curr7dHistRes.data  ?? []
  const prev7dHist  = prev7dHistRes.data  ?? []
  const instalOut   = instalOutstandingRes.data ?? []
  const instalOver  = instalOverdueRes.data    ?? []
  const instalToday = instalDueTodayRes.data   ?? []
  const dms         = dmsRes.data ?? []

  // ── Agency rollup metrics ─────────────────────────────────────────────────
  const total_mrr = sales
    .filter(s => s.payment_type === 'recurring')
    .reduce((s, r) => s + Number(r.amount), 0)

  const cash_collected_mtd = sales.reduce((s, r) => s + Number(r.amount), 0)

  // WoW for cash: curr 7d vs prev 7d
  const cash_curr7d = sales
    .filter(s => s.sale_date >= curr7dStart)
    .reduce((s, r) => s + Number(r.amount), 0)
  const cash_prev7d = prev7dSales.reduce((s, r) => s + Number(r.amount), 0)
  const cashWow     = wowDelta(cash_curr7d, cash_prev7d)

  // Booked calls MTD
  const booked_calls_mtd = historyMtd.length
  const bookedWow        = wowDelta(curr7dHist.length, prev7dHist.length)

  // Active leads
  const active_leads_count = leads.filter(l => !DEAD_STAGES.includes(l.stage)).length

  // DMs MTD
  const dms_mtd = dms.length

  // Per-creator lead stats
  const perCreatorLeads: Record<string, { showed: number; closed_won: number; booked: number }> = {}
  for (const l of leads) {
    const id = l.creator_id as string
    if (!perCreatorLeads[id]) perCreatorLeads[id] = { showed: 0, closed_won: 0, booked: 0 }
    if (l.stage === 'showed')     perCreatorLeads[id].showed++
    if (l.stage === 'closed_won') perCreatorLeads[id].closed_won++
    if (['call_booked','showed','closed_won','closed_lost','follow_up'].includes(l.stage))
      perCreatorLeads[id].booked++
  }

  const closeRates = Object.values(perCreatorLeads)
    .filter(c => c.showed >= 3)
    .map(c => (c.closed_won / c.showed) * 100)

  const showRates = Object.values(perCreatorLeads)
    .filter(c => c.booked >= 3)
    .map(c => ((c.showed + c.closed_won) / c.booked) * 100)

  const avg_close_rate = closeRates.length > 0
    ? Math.round(closeRates.reduce((a, b) => a + b, 0) / closeRates.length * 10) / 10 : 0
  const avg_show_rate  = showRates.length > 0
    ? Math.round(showRates.reduce((a, b) => a + b, 0) / showRates.length * 10) / 10  : 0

  // Total outstanding instalments (30d window)
  const total_outstanding = instalOut.reduce((s, r) => s + Number(r.amount), 0)

  // ── Outstanding per creator ───────────────────────────────────────────────
  const outstandingMap: Record<string, OutstandingData> = {}
  for (const row of instalOut) {
    const cid = row.creator_id as string
    if (!outstandingMap[cid]) outstandingMap[cid] = { total: 0, has_overdue: false }
    outstandingMap[cid].total += Number(row.amount)
    if (row.status === 'overdue') outstandingMap[cid].has_overdue = true
  }

  // ── Per-creator metrics ───────────────────────────────────────────────────
  const metricsMap: Record<string, CreatorMetrics> = {}
  for (const creator of creators) {
    const cSales  = sales.filter(s => s.creator_id === creator.id)
    const cLeads  = leads.filter(l => l.creator_id === creator.id)
    const cStats  = perCreatorLeads[creator.id] ?? { showed: 0, closed_won: 0, booked: 0 }

    const mrr = cSales.filter(s => s.payment_type === 'recurring').reduce((s, r) => s + Number(r.amount), 0)

    const close_rate = cStats.showed >= 3
      ? Math.round((cStats.closed_won / cStats.showed) * 100 * 10) / 10
      : null

    const show_rate = cStats.booked >= 3
      ? Math.round(((cStats.showed + cStats.closed_won) / cStats.booked) * 100 * 10) / 10
      : null

    const active_leads = cLeads.filter(l => !DEAD_STAGES.includes(l.stage)).length
    const activeLeads  = cLeads.filter(l => !DEAD_STAGES.includes(l.stage))
    const last_lead_at = activeLeads.length > 0 ? activeLeads[0].created_at as string : null

    metricsMap[creator.id] = { mrr, close_rate, show_rate, active_leads, last_lead_at }
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  const alerts: AdminAlert[] = []

  // Build overdue-7d and due-today lookup maps
  const overduePerCreator: Record<string, { count: number; oldestDue: string }> = {}
  for (const row of instalOver) {
    const cid = row.creator_id as string
    if (!overduePerCreator[cid]) overduePerCreator[cid] = { count: 0, oldestDue: row.due_date }
    overduePerCreator[cid].count++
    if (row.due_date < overduePerCreator[cid].oldestDue) overduePerCreator[cid].oldestDue = row.due_date
  }
  const dueTodayPerCreator: Record<string, number> = {}
  for (const row of instalToday) {
    const cid = row.creator_id as string
    dueTodayPerCreator[cid] = (dueTodayPerCreator[cid] ?? 0) + 1
  }

  for (const creator of creators) {
    const igState = getIgState(creator.integrations)
    const metrics = metricsMap[creator.id]

    // ── Red alerts ──
    if (igState === 'disconnected') {
      alerts.push({
        id:          `${creator.id}:ig_disconnected`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       'Instagram not connected — DM inbox and content sync are offline',
        severity:    'red',
      })
    }

    if (metrics.close_rate !== null && metrics.close_rate < 20) {
      alerts.push({
        id:          `${creator.id}:low_close_rate`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       `Close rate is ${metrics.close_rate}% — below 20% threshold`,
        severity:    'red',
        daysLabel:   'This month',
      })
    }

    if (metrics.show_rate !== null && metrics.show_rate < 40) {
      alerts.push({
        id:          `${creator.id}:low_show_rate`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       `Show rate is ${metrics.show_rate}% — below 40% threshold`,
        severity:    'red',
        daysLabel:   'This month',
      })
    }

    if (overduePerCreator[creator.id]) {
      const o = overduePerCreator[creator.id]
      const daysPast = Math.floor((Date.now() - new Date(o.oldestDue + 'T00:00:00Z').getTime()) / 86_400_000)
      alerts.push({
        id:          `${creator.id}:overdue_instalment`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       `${o.count} payment instalment${o.count !== 1 ? 's' : ''} overdue — outstanding collection needed`,
        severity:    'red',
        daysLabel:   `${daysPast}d overdue`,
      })
    }

    // ── Amber alerts ──
    if (igState === 'expiring') {
      alerts.push({
        id:          `${creator.id}:ig_expiring`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       'Instagram token expiring soon — re-auth before DMs go offline',
        severity:    'amber',
      })
    }

    if (!creator.ghl_location_id) {
      alerts.push({
        id:          `${creator.id}:no_ghl`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       'GoHighLevel not configured — call booking integration inactive',
        severity:    'amber',
      })
    }

    if (metrics.last_lead_at) {
      const daysSince = Math.floor((Date.now() - new Date(metrics.last_lead_at).getTime()) / 86_400_000)
      if (daysSince > 7) {
        alerts.push({
          id:          `${creator.id}:no_leads_7d`,
          creatorId:   creator.id,
          creatorName: creator.name,
          issue:       `No active leads in ${daysSince} days — pipeline may be stalled`,
          severity:    'amber',
          daysLabel:   `${daysSince}d no leads`,
        })
      }
    } else if (creator.onboarding_complete) {
      alerts.push({
        id:          `${creator.id}:no_leads_ever`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       'No leads created yet — pipeline setup may be incomplete',
        severity:    'amber',
      })
    }

    if (dueTodayPerCreator[creator.id]) {
      const n = dueTodayPerCreator[creator.id]
      alerts.push({
        id:          `${creator.id}:due_today`,
        creatorId:   creator.id,
        creatorName: creator.name,
        issue:       `${n} payment instalment${n !== 1 ? 's' : ''} due today`,
        severity:    'amber',
        daysLabel:   'Due today',
      })
    }
  }

  // ── Health scores per creator ─────────────────────────────────────────────
  const healthMap: Record<string, HealthScore> = {}
  for (const creator of creators) {
    const ca = alerts.filter(a => a.creatorId === creator.id)
    const red   = ca.filter(a => a.severity === 'red').length
    const amber = ca.filter(a => a.severity === 'amber').length
    let score: HealthScore = 0
    if (red > 0 || amber >= 2)  score = 2
    else if (amber === 1)        score = 1
    healthMap[creator.id] = score
  }

  // ── Serialize creators for client components ──────────────────────────────
  const serializedCreators: SerializedCreator[] = creators.map(c => {
    const users     = Array.isArray(c.users) ? (c.users as typeof c.users[])[0] ?? null : c.users
    const igAccount = Array.isArray(c.instagram_accounts)
      ? (c.instagram_accounts as (typeof c.instagram_accounts)[])[0] ?? null
      : c.instagram_accounts
    return {
      id:                  c.id,
      name:                c.name,
      niche:               c.niche,
      ghl_location_id:     c.ghl_location_id,
      onboarding_complete: c.onboarding_complete,
      created_at:          c.created_at,
      email:               (users as { email: string } | null)?.email ?? '—',
      ig_username:         igAccount?.username   ?? null,
      ig_followers:        igAccount?.followers_count ?? null,
      ig_updated_at:       igAccount?.updated_at ?? null,
      ig_state:            getIgState(c.integrations),
    }
  })

  // ── Rollup stats for the bar ──────────────────────────────────────────────
  const rollup = [
    { icon: DollarSign,     label: 'Total MRR',            value: fmtCurrency(total_mrr),         color: '#10b981', delta: null                      },
    { icon: DollarSign,     label: 'Cash Collected MTD',   value: fmtCurrency(cash_collected_mtd), color: '#60a5fa', delta: cashWow                   },
    { icon: Target,         label: 'Avg Close Rate',       value: `${avg_close_rate}%`,            color: avg_close_rate < 20 ? '#f87171' : '#a78bfa', delta: null },
    { icon: TrendingUp,     label: 'Avg Show Rate',        value: `${avg_show_rate}%`,             color: avg_show_rate < 40  ? '#f59e0b' : '#fbbf24', delta: null },
    { icon: Calendar,       label: 'Booked Calls MTD',     value: booked_calls_mtd,                color: '#34d399', delta: bookedWow                 },
    { icon: MessageSquare,  label: 'DMs MTD',              value: dms_mtd,                         color: '#f9fafb', delta: null                      },
    { icon: CreditCard,     label: 'Outstanding (30d)',    value: total_outstanding > 0 ? fmtCurrency(total_outstanding) : '—', color: total_outstanding > 0 ? '#f87171' : '#4b5563', delta: null },
  ]

  const redAlerts   = alerts.filter(a => a.severity === 'red').length
  const totalAlerts = alerts.length

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: '#0a0f1e' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#f9fafb]">Agency Overview</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {creators.length} creator{creators.length !== 1 ? 's' : ''} · month-to-date
            {totalAlerts > 0 && (
              <span className="ml-2 font-semibold" style={{ color: redAlerts > 0 ? '#f87171' : '#fbbf24' }}>
                · {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''} active
              </span>
            )}
          </p>
        </div>
        <Link
          href="/admin/team"
          className="rounded-xl px-4 py-2 text-[12px] font-semibold text-[#9ca3af] transition-colors hover:text-[#f9fafb]"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          Team Overview →
        </Link>
      </div>

      {/* ── 1. Agency Rollup Bar ────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2.5">
        {rollup.map(s => (
          <RollupChip
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            color={s.color}
            delta={s.delta}
          />
        ))}
      </div>

      {/* ── 2. Alerts Strip (before creator cards) ───────────────────── */}
      <AlertsStrip alerts={alerts} />

      {/* ── 3. Creator Cards Grid ────────────────────────────────────── */}
      <CreatorGrid
        creators={serializedCreators}
        metricsMap={metricsMap}
        healthMap={healthMap}
        outstandingMap={outstandingMap}
      />

      {/* ── 4. Team Overview link ────────────────────────────────────── */}
      {creators.length > 0 && (
        <div
          className="mt-10 flex items-center justify-between rounded-xl px-5 py-4"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="text-[13px] font-semibold text-[#f9fafb]">Team</p>
            <p className="text-[12px] text-[#6b7280]">Setters, closers, and sales admins across all creators</p>
          </div>
          <Link
            href="/admin/team"
            className="rounded-xl px-4 py-2 text-[12px] font-semibold text-white"
            style={{ backgroundColor: '#2563eb' }}
          >
            View Team →
          </Link>
        </div>
      )}
    </div>
  )
}
