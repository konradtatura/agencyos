'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { FunnelBranchesResponse } from '@/app/api/metrics/funnel-branches/route'
import DateRangePicker from '@/components/ui/date-range-picker'

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'

const MONO = "'JetBrains Mono', 'Fira Code', monospace"

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Safe percentage — returns null if would exceed 100% or denominator is 0 */
function safePct(n: number, d: number): number | null {
  if (!d) return null
  const v = (n / d) * 100
  return v > 100 ? null : v
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `${n.toFixed(1)}%`
}

function nextColor(pct: number | null): string {
  if (pct === null) return 'rgba(255,255,255,0.25)'
  if (pct >= 40) return '#10b981'
  if (pct >= 15) return '#f59e0b'
  return '#ef4444'
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      style={{
        backgroundColor: '#0d1117',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        className="animate-pulse"
        style={{
          height: 36,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      />
      {/* Skeleton rows */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            height: 48,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            backgroundColor: i % 3 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FunnelStatsView() {
  const [range,      setRange]      = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState<string | undefined>()
  const [customTo,   setCustomTo]   = useState<string | undefined>()
  const [funnelId,   setFunnelId]   = useState<string>('')
  const [data,       setData]       = useState<FunnelBranchesResponse | null>(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ range })
    if (range === 'custom' && customFrom) params.set('from', customFrom)
    if (range === 'custom' && customTo)   params.set('to', customTo)
    if (funnelId) params.set('funnel_id', funnelId)

    fetch(`/api/metrics/funnel-branches?${params}`)
      .then(r => r.json())
      .then((d: FunnelBranchesResponse) => {
        setData(d)
        if (!funnelId && d.funnel_id) setFunnelId(d.funnel_id)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [range, customFrom, customTo, funnelId])

  // ── Controls ───────────────────────────────────────────────────────────────

  const controls = (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
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

      <DateRangePicker
        value={{ range, from: customFrom, to: customTo }}
        onChange={(v) => {
          setRange(v.range as Range)
          setCustomFrom(v.from)
          setCustomTo(v.to)
        }}
      />
    </div>
  )

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div>{controls}<LoadingSkeleton /></div>
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  const hasData = data && (
    data.entry_visits > 0 ||
    data.branches.some(b => b.steps.some(s => s.visits > 0))
  )

  if (!hasData) {
    return (
      <div>
        {controls}
        <div
          className="text-center py-12"
          style={{
            backgroundColor: '#0d1117',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
          }}
        >
          <p className="text-sm font-medium text-[#9ca3af] mb-1">No funnel data yet</p>
          <p className="text-xs text-[#4b5563]">
            Paste the tracking script into your GHL funnel pages to start tracking.
            <br />The script is in the panel above ↑
          </p>
        </div>
      </div>
    )
  }

  const entryVisits = data!.entry_visits

  // ── Biggest drop-off (non-zero steps only) ─────────────────────────────────

  let worstStep: { label: string; branchLabel: string; pct: number } | null = null
  for (const branch of data!.branches) {
    for (const step of branch.steps) {
      if (!step.visits) continue
      const p = safePct(step.visits, entryVisits)
      if (p !== null && (!worstStep || p < worstStep.pct)) {
        worstStep = { label: step.label, branchLabel: branch.label, pct: p }
      }
    }
  }

  // ── Table cell style helpers ───────────────────────────────────────────────

  const cellBase: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    fontSize: 13,
  }

  const numCell: React.CSSProperties = {
    ...cellBase,
    fontFamily: MONO,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.8)',
    whiteSpace: 'nowrap',
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {controls}

      {/* Table */}
      <div
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {/* Header */}
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Page', 'Unique', '→ Next', '% of Entry'].map((col, i) => (
                <th
                  key={col}
                  style={{
                    padding: '10px 16px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)',
                    textAlign: i === 0 ? 'left' : 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* ── Entry row ─────────────────────────────────────────────── */}
            <tr>
              <td
                style={{
                  ...cellBase,
                  borderLeft: '2px solid #2563eb',
                  paddingLeft: 14,
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                    {data!.funnel_name || 'Entry'}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 4,
                      backgroundColor: 'rgba(37,99,235,0.15)',
                      color: '#60a5fa',
                      letterSpacing: '0.05em',
                    }}
                  >
                    ENTRY
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: MONO }}>
                  {data!.entry_path}
                </div>
              </td>
              <td style={numCell}>{entryVisits.toLocaleString()}</td>
              <td style={{ ...numCell, color: 'rgba(255,255,255,0.2)' }}>—</td>
              <td style={{ ...numCell, color: 'rgba(255,255,255,0.35)' }}>100% — baseline</td>
            </tr>

            {/* ── Branches ──────────────────────────────────────────────── */}
            {data!.branches.map(branch => (
              <>
                {/* Branch separator */}
                <tr key={`sep-${branch.id}`}>
                  <td
                    colSpan={4}
                    style={{
                      padding: '0 16px',
                      height: 32,
                      backgroundColor: `${branch.color}14`,
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: 4,
                        backgroundColor: `${branch.color}22`,
                        color: branch.color,
                      }}
                    >
                      {branch.label}
                    </span>
                  </td>
                </tr>

                {/* Step rows */}
                {branch.steps.map((step, idx) => {
                  const hasVisits = step.visits > 0
                  const ofEntry   = safePct(step.visits, entryVisits)

                  // → Next: next step in THIS branch, never across branches
                  const nextStep  = branch.steps[idx + 1]
                  const nextPct   = nextStep
                    ? safePct(nextStep.visits, step.visits)
                    : null
                  const isLast    = idx === branch.steps.length - 1

                  return (
                    <tr
                      key={step.path}
                      style={{ opacity: hasVisits ? 1 : 0.45 }}
                    >
                      {/* Page name + path */}
                      <td style={{ ...cellBase, paddingLeft: 28 }}>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                          {step.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: MONO }}>
                          {step.path}
                        </div>
                      </td>

                      {/* Unique */}
                      <td style={numCell}>
                        {hasVisits ? step.visits.toLocaleString() : '—'}
                      </td>

                      {/* → Next */}
                      <td style={{ ...numCell, color: isLast ? 'rgba(255,255,255,0.2)' : nextColor(nextPct) }}>
                        {isLast
                          ? '—'
                          : nextPct === null
                            ? <span title="Direct traffic detected — step has more visits than previous step">—*</span>
                            : `${nextPct.toFixed(1)}%`
                        }
                      </td>

                      {/* % of Entry */}
                      <td style={{ ...numCell, color: 'rgba(255,255,255,0.35)' }}>
                        {fmtPct(ofEntry)}
                      </td>
                    </tr>
                  )
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary line */}
      <p className="text-xs text-[#6b7280] mt-3 px-1">
        {entryVisits.toLocaleString()} total unique visitors entered this funnel in the selected period
      </p>

      {/* Biggest drop-off callout */}
      {worstStep && entryVisits > 0 && (
        <div
          className="flex items-start gap-2 mt-3 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            color: '#f59e0b',
          }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Biggest drop-off:{' '}
            <strong>{worstStep.label} ({worstStep.branchLabel})</strong>
            {' '}— only {worstStep.pct.toFixed(1)}% of entry visitors reached this step
          </span>
        </div>
      )}
    </div>
  )
}
