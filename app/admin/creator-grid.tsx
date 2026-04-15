'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import ImpersonateButton from './impersonate-button'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SerializedCreator {
  id:                  string
  name:                string
  niche:               string | null
  ghl_location_id:     string | null
  onboarding_complete: boolean
  created_at:          string
  email:               string
  ig_username:         string | null
  ig_followers:        number | null
  ig_updated_at:       string | null
  ig_state:            'connected' | 'expiring' | 'disconnected'
}

export interface CreatorMetrics {
  mrr:          number
  close_rate:   number | null
  show_rate:    number | null
  active_leads: number
  last_lead_at: string | null
}

export interface OutstandingData {
  total:      number   // sum of all non-paid instalments
  has_overdue: boolean
}

// health: 0=green, 1=amber, 2=red
export type HealthScore = 0 | 1 | 2

type SortKey = 'health' | 'mrr' | 'close_rate' | 'show_rate' | 'active_leads'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'health',       label: 'Health'       },
  { key: 'mrr',         label: 'MRR'          },
  { key: 'close_rate',  label: 'Close Rate'   },
  { key: 'show_rate',   label: 'Show Rate'    },
  { key: 'active_leads', label: 'Active Leads' },
]

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
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
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

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.color as string }} />
      {label}
    </span>
  )
}

function HealthBadge({ score }: { score: HealthScore }) {
  const cfg = score === 2
    ? { color: '#f87171', bg: 'rgba(239,68,68,0.1)', dot: '#ef4444', label: 'Critical' }
    : score === 1
    ? { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)', dot: '#f59e0b', label: 'Warning' }
    : { color: '#34d399', bg: 'rgba(16,185,129,0.1)', dot: '#10b981', label: 'Healthy' }
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ backgroundColor: cfg.bg }}>
      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.dot }} />
      <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}

// ── Creator Card ──────────────────────────────────────────────────────────────

function CreatorCard({
  creator,
  metrics,
  outstanding,
  health,
}: {
  creator:     SerializedCreator
  metrics:     CreatorMetrics
  outstanding: OutstandingData
  health:      HealthScore
}) {
  const colors   = avatarColors(creator.name)
  const initials = getInitials(creator.name)

  const BORDER = health === 2
    ? '1px solid rgba(239,68,68,0.2)'
    : health === 1
    ? '1px solid rgba(245,158,11,0.2)'
    : '1px solid rgba(255,255,255,0.06)'

  const IG_STYLES = {
    connected:    { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', label: 'IG Connected'  },
    expiring:     { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'IG Expiring'   },
    disconnected: { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', label: 'No IG'         },
  }
  const igStyle = IG_STYLES[creator.ig_state]

  return (
    <div
      className="flex flex-col rounded-xl p-5"
      style={{ backgroundColor: '#111827', border: BORDER }}
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
        <HealthBadge score={health} />
      </div>

      {/* Email + date */}
      <p className="mb-0.5 text-[12px] text-[#9ca3af]">{creator.email}</p>
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

      {/* IG followers row */}
      {creator.ig_username && creator.ig_state !== 'disconnected' && (
        <div
          className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="#6b7280" strokeWidth="1.75" />
            <circle cx="12" cy="12" r="4.5" stroke="#6b7280" strokeWidth="1.75" />
            <circle cx="17.5" cy="6.5" r="1" fill="#6b7280" />
          </svg>
          <span className="text-[11px] text-[#9ca3af]">@{creator.ig_username}</span>
          {creator.ig_followers != null && (
            <>
              <span className="text-[#374151]">·</span>
              <span className="font-mono text-[11px] font-semibold text-[#d1d5db]">
                {fmtFollowers(creator.ig_followers)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Metric pills */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          {
            label: 'MRR',
            value: fmtCurrency(metrics.mrr),
            color: '#10b981',
          },
          {
            label: 'Close Rate',
            value: metrics.close_rate !== null ? `${metrics.close_rate}%` : '—',
            color: metrics.close_rate !== null && metrics.close_rate < 20 ? '#ef4444' : '#f9fafb',
          },
          {
            label: 'Show Rate',
            value: metrics.show_rate !== null ? `${metrics.show_rate}%` : '—',
            color: metrics.show_rate !== null && metrics.show_rate < 40 ? '#f59e0b' : '#f9fafb',
          },
          {
            label: 'Active Leads',
            value: metrics.active_leads,
            color: '#f9fafb',
          },
          {
            label: 'Outstanding',
            value: outstanding.total > 0 ? fmtCurrency(outstanding.total) : '—',
            color: outstanding.has_overdue ? '#f87171' : outstanding.total > 0 ? '#fbbf24' : '#4b5563',
          },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg px-2 py-2 text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="font-mono text-[13px] font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="text-[10px] text-[#4b5563]">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-auto flex gap-2">
        <ImpersonateButton creatorId={creator.id} />
        <Link
          href="/admin/creators"
          className="flex items-center justify-center rounded-lg px-3 py-2 text-[12px] font-medium text-[#9ca3af] transition-colors hover:text-[#f9fafb]"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
        >
          Edit
        </Link>
      </div>
    </div>
  )
}

// ── Creator Grid (default export) ─────────────────────────────────────────────

interface CreatorGridProps {
  creators:       SerializedCreator[]
  metricsMap:     Record<string, CreatorMetrics>
  healthMap:      Record<string, HealthScore>
  outstandingMap: Record<string, OutstandingData>
}

export default function CreatorGrid({
  creators,
  metricsMap,
  healthMap,
  outstandingMap,
}: CreatorGridProps) {
  const [sortKey, setSortKey] = useState<SortKey>('health')

  const sorted = useMemo(() => {
    return [...creators].sort((a, b) => {
      switch (sortKey) {
        case 'health': {
          // worst first: 2 (red) → 1 (amber) → 0 (green)
          const ha = healthMap[a.id] ?? 0
          const hb = healthMap[b.id] ?? 0
          if (hb !== ha) return hb - ha
          // tie-break: more active leads = higher priority
          return (metricsMap[b.id]?.active_leads ?? 0) - (metricsMap[a.id]?.active_leads ?? 0)
        }
        case 'mrr':
          return (metricsMap[b.id]?.mrr ?? 0) - (metricsMap[a.id]?.mrr ?? 0)
        case 'close_rate': {
          // worst first (ascending)
          const ca = metricsMap[a.id]?.close_rate ?? 999
          const cb = metricsMap[b.id]?.close_rate ?? 999
          return ca - cb
        }
        case 'show_rate': {
          const sa = metricsMap[a.id]?.show_rate ?? 999
          const sb = metricsMap[b.id]?.show_rate ?? 999
          return sa - sb
        }
        case 'active_leads':
          return (metricsMap[b.id]?.active_leads ?? 0) - (metricsMap[a.id]?.active_leads ?? 0)
        default:
          return 0
      }
    })
  }, [creators, sortKey, metricsMap, healthMap])

  if (creators.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
        style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-[14px] font-medium text-[#9ca3af]">No creators yet</p>
      </div>
    )
  }

  return (
    <div>
      {/* Sort controls */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[11px] font-medium text-[#4b5563]">Sort by</span>
        <div className="flex gap-1">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                backgroundColor: sortKey === opt.key ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)',
                color: sortKey === opt.key ? '#60a5fa' : '#6b7280',
                border: sortKey === opt.key ? '1px solid rgba(37,99,235,0.3)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map(creator => (
          <CreatorCard
            key={creator.id}
            creator={creator}
            metrics={metricsMap[creator.id] ?? { mrr: 0, close_rate: null, show_rate: null, active_leads: 0, last_lead_at: null }}
            outstanding={outstandingMap[creator.id] ?? { total: 0, has_overdue: false }}
            health={healthMap[creator.id] ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
