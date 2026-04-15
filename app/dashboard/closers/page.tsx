'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import type { CrmMetricsResponse, CloserRow } from '@/app/api/metrics/crm/route'

type Range = 'today' | '7d' | '30d' | 'month' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d',    label: '7d'    },
  { value: '30d',   label: '30d'   },
  { value: 'month', label: 'Month' },
  { value: 'all',   label: 'All'   },
]

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtRate(rate: number, denom: number) {
  return denom > 0 ? `${rate.toFixed(1)}%` : '—'
}

function showRateColor(rate: number, denom: number): string {
  if (denom === 0) return '#9ca3af'
  if (rate >= 60) return '#34d399'
  if (rate >= 40) return '#f59e0b'
  return '#ef4444'
}

function closeRateColor(rate: number, denom: number): string {
  if (denom === 0) return '#9ca3af'
  if (rate >= 20) return '#34d399'
  if (rate >= 10) return '#f59e0b'
  return '#ef4444'
}

function RevenueBadge({ amount }: { amount: number }) {
  return (
    <span
      style={{
        backgroundColor: 'rgba(16,185,129,0.10)',
        color:           '#34d399',
        fontSize:        '11px',
        fontWeight:      600,
        padding:         '2px 10px',
        borderRadius:    '9999px',
        whiteSpace:      'nowrap',
      }}
    >
      {fmtUSD(amount)} closed
    </span>
  )
}

function StatBlock({
  label,
  value,
  color,
  small,
}: {
  label: string
  value: string
  color?: string
  small?: boolean
}) {
  return (
    <div>
      <p
        style={{
          fontSize:      '10px',
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color:         '#6b7280',
          marginBottom:  '4px',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize:   small ? '16px' : '20px',
          fontWeight: 700,
          color:      color ?? '#f9fafb',
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  )
}

function CloserCard({ closer }: { closer: CloserRow }) {
  const showFooter = closer.aov > 0 || closer.followup_payments > 0

  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: '#111827',
        border:          '1px solid rgba(255,255,255,0.06)',
        padding:         '20px',
      }}
    >
      {/* Top row */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#f9fafb' }}>
          {closer.name}
        </p>
        <RevenueBadge amount={closer.revenue_generated} />
      </div>

      {/* Primary stats */}
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-4">
        <StatBlock
          label="Calls Taken"
          value={String(closer.calls_taken)}
        />
        <StatBlock
          label="Show Rate"
          value={fmtRate(closer.show_rate, closer.calls_booked)}
          color={showRateColor(closer.show_rate, closer.calls_booked)}
        />
        <StatBlock
          label="Close Rate"
          value={fmtRate(closer.close_rate, closer.showed)}
          color={closeRateColor(closer.close_rate, closer.showed)}
        />
        <StatBlock
          label="Cash Collected"
          value={fmtUSD(closer.cash_collected)}
        />
      </div>

      {/* Secondary stats */}
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <StatBlock label="Showed"      value={String(closer.showed)}      small />
        <StatBlock label="No-Shows"    value={String(closer.no_showed)}   small />
        <StatBlock label="Closes"      value={String(closer.closes)}      small />
        <StatBlock label="Offers Made" value={String(closer.offers_made)} small />
      </div>

      {/* Footer — AOV + follow-up payments */}
      {showFooter && (
        <>
          <div
            className="my-4"
            style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {closer.aov > 0 && (
              <div className="flex items-baseline gap-2">
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' }}>
                  AOV
                </p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af' }}>
                  {fmtUSD(closer.aov)}
                </p>
              </div>
            )}
            {closer.followup_payments > 0 && (
              <div className="flex items-baseline gap-2">
                <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' }}>
                  Follow-up Payments
                </p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af' }}>
                  {closer.followup_payments}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: '#111827',
        border:          '1px solid rgba(255,255,255,0.06)',
        padding:         '20px',
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <Skeleton className="h-4 w-36 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <Skeleton className="h-4 w-24 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-1 h-2 w-16 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <Skeleton className="h-5 w-12 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-1 h-2 w-14 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <Skeleton className="h-4 w-8 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ClosersPage() {
  const [range, setRange]     = useState<Range>('30d')
  const [closers, setClosers] = useState<CloserRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (r: Range) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/metrics/crm?range=${r}`)
      if (res.ok) {
        const json: CrmMetricsResponse = await res.json()
        // Use current-month slice for 'month', all-time for everything else
        const rows = r === 'month' ? json.closers_current_month : json.closers_all_time
        setClosers(rows ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(range) }, [range, fetchData])

  return (
    <div>
      <PageHeader title="Closers" subtitle="Call and revenue performance by closer" />

      {/* ── Range selector ───────────────────────────────────────────────── */}
      <div
        className="mb-6 inline-flex gap-1 rounded-lg p-1"
        style={{
          backgroundColor: '#1f2937',
          border:          '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {RANGES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setRange(value)}
            style={{
              backgroundColor: range === value ? '#2563eb' : 'transparent',
              color:           range === value ? '#ffffff' : '#9ca3af',
              border:          'none',
              borderRadius:    '6px',
              padding:         '5px 14px',
              fontSize:        '13px',
              fontWeight:      500,
              cursor:          'pointer',
              transition:      'background-color 0.15s, color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : closers.length === 0 ? (
        <div
          className="flex min-h-[20vh] items-center justify-center rounded-xl"
          style={{
            backgroundColor: '#111827',
            border:          '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>
            No closer data for this period.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {closers.map((closer) => (
            <CloserCard key={closer.user_id} closer={closer} />
          ))}
        </div>
      )}
    </div>
  )
}
