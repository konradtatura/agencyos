'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { FunnelBranchesResponse } from '@/app/api/metrics/funnel-branches/route'

// ── Constants ──────────────────────────────────────────────────────────────────

const RANGES = [
  { value: 'today', label: 'Today'      },
  { value: '7d',    label: '7D'         },
  { value: '30d',   label: '30D'        },
  { value: 'month', label: 'This Month' },
  { value: 'all',   label: 'All Time'   },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  if (!d) return '—'
  return `${((n / d) * 100).toFixed(1)}%`
}

function continuedColor(ratio: number): string {
  if (ratio >= 0.5) return '#10b981'
  if (ratio >= 0.2) return '#f59e0b'
  return '#ef4444'
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
    />
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        backgroundColor: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '20px 24px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FunnelStatsView() {
  const [range, setRange] = useState('30d')
  const [funnelId, setFunnelId] = useState<string>('')
  const [data, setData] = useState<FunnelBranchesResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ range })
    if (funnelId) params.set('funnel_id', funnelId)

    fetch(`/api/metrics/funnel-branches?${params}`)
      .then(r => r.json())
      .then((d: FunnelBranchesResponse) => {
        setData(d)
        // Set default funnel_id on first load
        if (!funnelId && d.funnel_id) setFunnelId(d.funnel_id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [range, funnelId])

  // ── Controls ───────────────────────────────────────────────────────────────

  const controls = (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      {/* Funnel selector */}
      {data && data.all_funnels.length > 1 && (
        <select
          value={funnelId}
          onChange={e => setFunnelId(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer"
          style={{
            backgroundColor: '#1f2937',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f9fafb',
          }}
        >
          {data.all_funnels.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}

      {/* Date range toggles */}
      <div
        className="flex items-center gap-0.5 rounded-lg p-0.5"
        style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {RANGES.map(r => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className="text-xs px-3 py-1.5 rounded-md transition-colors"
            style={{
              backgroundColor: range === r.value ? '#2563eb' : 'transparent',
              color: range === r.value ? '#fff' : '#9ca3af',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )

  // ── Empty state ────────────────────────────────────────────────────────────

  const hasData = data && (
    data.entry_visits > 0 ||
    data.branches.some(b => b.steps.some(s => s.visits > 0))
  )

  if (loading) {
    return (
      <div>
        {controls}
        <LoadingSkeleton />
      </div>
    )
  }

  if (!hasData) {
    return (
      <div>
        {controls}
        <p className="text-sm text-[#6b7280] text-center py-8">
          No funnel data yet.
          <br />
          <span className="text-[#4b5563]">
            Paste the tracking script into each GHL funnel page to start tracking. The script is shown above ↑
          </span>
        </p>
      </div>
    )
  }

  const entryVisits = data!.entry_visits

  // ── Biggest drop-off ───────────────────────────────────────────────────────

  let worstStep: { label: string; branchLabel: string; ratio: number } | null = null
  for (const branch of data!.branches) {
    for (const step of branch.steps) {
      const ratio = entryVisits > 0 ? step.visits / entryVisits : 0
      if (!worstStep || ratio < worstStep.ratio) {
        worstStep = { label: step.label, branchLabel: branch.label, ratio }
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {controls}

      {/* Entry step */}
      <Card style={{ marginBottom: 12 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-[#6b7280]">Entry</span>
            <p className="text-sm text-[#9ca3af] mt-0.5" style={{ fontFamily: 'monospace' }}>
              {data!.entry_path}
            </p>
          </div>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: '#f9fafb' }}
          >
            {entryVisits.toLocaleString()}
            <span className="text-sm font-normal text-[#6b7280] ml-1">visitors</span>
          </span>
        </div>
        <div className="w-full rounded-full h-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-2 rounded-full"
            style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.2)' }}
          />
        </div>
        <p className="text-xs text-[#6b7280] mt-1.5 text-right">100% — entry baseline</p>
      </Card>

      {/* Branch cards */}
      {data!.branches.map(branch => (
        <Card key={branch.id} style={{ marginBottom: 12 }}>
          {/* Branch header */}
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-4 pb-2"
            style={{
              color: branch.color,
              borderBottom: `1px solid ${branch.color}22`,
            }}
          >
            {branch.label}
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {branch.steps.map((step, idx) => {
              const prev = idx === 0 ? entryVisits : branch.steps[idx - 1].visits
              const continuedRatio = prev > 0 ? step.visits / prev : 0
              const hasVisits = step.visits > 0

              return (
                <div key={step.path} style={{ opacity: hasVisits ? 1 : 0.4 }}>
                  {/* Step row */}
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-sm text-[#f9fafb] w-40 shrink-0 truncate">{step.label}</span>
                    <span
                      className="text-sm tabular-nums w-16 shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: '#f9fafb' }}
                    >
                      {hasVisits ? step.visits.toLocaleString() : '—'}
                    </span>
                    {/* Bar */}
                    <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      {hasVisits && entryVisits > 0 && (
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min((step.visits / entryVisits) * 100, 100)}%`,
                            backgroundColor: `${branch.color}88`,
                          }}
                        />
                      )}
                    </div>
                    <span className="text-xs text-[#6b7280] w-24 text-right shrink-0">
                      {pct(step.visits, entryVisits)} of entry
                    </span>
                  </div>

                  {/* Continued indicator (between steps) */}
                  {idx < branch.steps.length - 1 && hasVisits && (
                    <p
                      className="text-xs ml-44 mt-1"
                      style={{ color: continuedColor(continuedRatio) }}
                    >
                      ↓ {pct(branch.steps[idx + 1].visits, step.visits)} continued
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      {/* Biggest drop-off callout */}
      {worstStep && entryVisits > 0 && (
        <div
          className="flex items-start gap-2 mt-2 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#f59e0b',
          }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Biggest drop-off:{' '}
            <strong>
              {worstStep.label} ({worstStep.branchLabel})
            </strong>{' '}
            — only {(worstStep.ratio * 100).toFixed(1)}% of visitors reach this step
          </span>
        </div>
      )}
    </div>
  )
}
