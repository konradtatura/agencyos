'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import type { CrmMetricsResponse, SetterRow } from '@/app/api/metrics/crm/route'

type Range = 'today' | '7d' | '30d' | 'month' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d',    label: '7d'    },
  { value: '30d',   label: '30d'   },
  { value: 'month', label: 'Month' },
  { value: 'all',   label: 'All'   },
]

function bookRateColor(rate: number, hasOutbound: boolean): string {
  if (!hasOutbound) return '#9ca3af'
  if (rate >= 15) return '#34d399'
  if (rate >= 8)  return '#f59e0b'
  return '#ef4444'
}

function StreakBadge({ streak }: { streak: number }) {
  const label = streak >= 3 ? `🔥 ${streak}d streak` : `${streak} day streak`
  return (
    <span
      style={{
        backgroundColor: 'rgba(37,99,235,0.12)',
        color:           '#60a5fa',
        fontSize:        '11px',
        fontWeight:      600,
        padding:         '2px 10px',
        borderRadius:    '9999px',
      }}
    >
      {label}
    </span>
  )
}

function SetterCard({ setter }: { setter: SetterRow }) {
  const hasOutbound = setter.outbound_sent > 0 || setter.inbound_received > 0
  const bookRateDisplay = hasOutbound ? `${setter.book_rate.toFixed(1)}%` : '—'

  const stats = [
    { label: 'Outbound DMs', value: String(setter.outbound_sent) },
    { label: 'Inbound',      value: String(setter.inbound_received) },
    { label: 'Good Convos',  value: String(setter.calls_booked_inbound) },
    { label: 'Links Sent',   value: String(setter.booking_links_sent) },
    { label: 'Calls Booked', value: String(setter.total_booked) },
    { label: 'Book Rate',    value: bookRateDisplay, color: bookRateColor(setter.book_rate, hasOutbound) },
  ]

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#f9fafb' }}>
          {setter.name}
        </p>
        <StreakBadge streak={setter.streak} />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        {stats.map((stat) => (
          <div key={stat.label}>
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
              {stat.label}
            </p>
            <p
              style={{
                fontSize:   '20px',
                fontWeight: 700,
                color:      stat.color ?? '#f9fafb',
                lineHeight: 1,
              }}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>
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
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-32 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <Skeleton className="h-4 w-20 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-1 h-2 w-16 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <Skeleton className="h-6 w-10 animate-pulse rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SettersPage() {
  const [range, setRange]     = useState<Range>('30d')
  const [setters, setSetters] = useState<SetterRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (r: Range) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/metrics/crm?range=${r}`)
      if (res.ok) {
        const json: CrmMetricsResponse = await res.json()
        setSetters(json.setters ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(range) }, [range, fetchData])

  return (
    <div>
      <PageHeader title="Setters" subtitle="DM and booking performance by setter" />

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
      ) : setters.length === 0 ? (
        <div
          className="flex min-h-[20vh] items-center justify-center rounded-xl"
          style={{
            backgroundColor: '#111827',
            border:          '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>
            No setter data for this period.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {setters.map((setter) => (
            <SetterCard key={setter.user_id} setter={setter} />
          ))}
        </div>
      )}
    </div>
  )
}
