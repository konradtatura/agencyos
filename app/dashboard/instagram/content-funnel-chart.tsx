'use client'

import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FunnelData {
  views_7d:           number | null
  views_30d:          number | null
  profile_visits_7d:  number | null
  profile_visits_30d: number | null
  website_clicks_7d:  number | null
  website_clicks_30d: number | null
  new_followers_7d:   number | null
  new_followers_30d:  number | null
}

type Mode  = 'link' | 'follow'
type Range = 7 | 30

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtNum(n: number | null): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${sign}${(abs / 1_000).toFixed(1)}K`
  if (abs >= 1_000)     return `${sign}${abs.toLocaleString()}`
  return String(n)
}

// ── Toggle components ──────────────────────────────────────────────────────────

function TabGroup<T extends string | number>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
  labels?: Record<string, string>
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
    >
      {options.map((opt) => (
        <button
          key={String(opt)}
          type="button"
          onClick={() => onChange(opt)}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all"
          style={
            value === opt
              ? { backgroundColor: 'rgba(37,99,235,0.25)', color: '#60a5fa' }
              : { color: '#6b7280' }
          }
        >
          {labels ? labels[String(opt)] : String(opt)}
        </button>
      ))}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ContentFunnelChart({ data }: { data: FunnelData }) {
  const [mode, setMode]           = useState<Mode>('link')
  const [range, setRange]         = useState<Range>(7)
  const [showPeople, setShowPeople] = useState(true)

  // Stage definitions per mode
  const stages =
    mode === 'link'
      ? [
          { label: 'Views',          value: range === 7 ? data.views_7d          : data.views_30d  },
          { label: 'Profile Visits', value: range === 7 ? data.profile_visits_7d : data.profile_visits_30d },
          { label: 'Website Clicks', value: range === 7 ? data.website_clicks_7d : data.website_clicks_30d },
        ]
      : [
          { label: 'Views',          value: range === 7 ? data.views_7d          : data.views_30d  },
          { label: 'Profile Visits', value: range === 7 ? data.profile_visits_7d : data.profile_visits_30d },
          { label: 'New Followers',  value: range === 7 ? data.new_followers_7d  : data.new_followers_30d  },
        ]

  const topValue = stages[0].value ?? 0

  // Bar opacity decreases from top to bottom so widest bar has most visual weight
  const BAR_OPACITIES = [1, 0.65, 0.38]

  // Headline conversion rates for the chips below the funnel
  const s0 = stages[0].value
  const s1 = stages[1].value
  const s2 = stages[2].value
  const viewToProfile  = s0 && s1 && s0 > 0 ? (s1 / s0) * 100 : null
  const profileToEnd   = s1 && s2 && s1 > 0 ? (s2 / s1) * 100 : null
  const endChipLabel   = mode === 'link' ? 'Profile → Link' : 'Profile → Follow'

  const hasAnyData = s0 != null || s1 != null || s2 != null

  return (
    <div
      className="rounded-xl px-6 py-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#f9fafb]">Content Funnel</p>
          <p className="mt-0.5 text-[11px] text-[#6b7280]">
            {mode === 'link'
              ? 'Views → Profile Visits → Website Clicks'
              : 'Views → Profile Visits → New Followers'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Show: People / % */}
          <div className="flex items-center gap-1 text-[11px]" style={{ color: '#6b7280' }}>
            <span className="mr-0.5">Show:</span>
            <button
              type="button"
              onClick={() => setShowPeople(true)}
              className="rounded px-2 py-0.5 text-[11px] font-semibold transition-all"
              style={showPeople
                ? { backgroundColor: 'rgba(255,255,255,0.08)', color: '#f9fafb' }
                : { color: '#6b7280' }}
            >
              People
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => setShowPeople(false)}
              className="rounded px-2 py-0.5 text-[11px] font-semibold transition-all"
              style={!showPeople
                ? { backgroundColor: 'rgba(255,255,255,0.08)', color: '#f9fafb' }
                : { color: '#6b7280' }}
            >
              %
            </button>
          </div>

          {/* Mode */}
          <TabGroup<Mode>
            options={['link', 'follow']}
            value={mode}
            onChange={setMode}
            labels={{ link: 'Content → Link', follow: 'Content → Follow' }}
          />

          {/* Range */}
          <TabGroup<Range>
            options={[7, 30]}
            value={range}
            onChange={setRange}
            labels={{ 7: '7d', 30: '30d' }}
          />
        </div>
      </div>

      {/* ── Funnel ─────────────────────────────────────────────────────────── */}
      {!hasAnyData ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-[13px]" style={{ color: '#4b5563' }}>
            No data available for this period.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-0 px-2">
            {stages.map((stage, i) => {
              const widthPct =
                topValue > 0 && stage.value != null
                  ? Math.max((stage.value / topValue) * 100, 1.5)
                  : stage.value === 0
                  ? 1.5
                  : 0

              // Drop-off between this stage and the previous one
              const prev    = i > 0 ? stages[i - 1] : null
              const lost    = prev?.value != null && stage.value != null ? stage.value - prev.value : null
              const dropPct =
                prev?.value != null && stage.value != null && prev.value > 0
                  ? ((stage.value - prev.value) / prev.value) * 100
                  : null

              return (
                <div key={stage.label}>
                  {/* Drop-off row */}
                  {i > 0 && (
                    <div className="my-2.5 flex items-center justify-center gap-3">
                      <span className="text-[13px] font-bold" style={{ color: '#ef4444' }}>↓</span>
                      {showPeople ? (
                        <span
                          className="text-[12px] font-semibold tabular-nums"
                          style={{ color: '#ef4444' }}
                        >
                          {lost != null
                            ? `${lost < 0 ? '' : '+'}${fmtNum(lost)} people`
                            : '—'}
                        </span>
                      ) : (
                        <span
                          className="text-[12px] font-semibold tabular-nums"
                          style={{ color: '#ef4444' }}
                        >
                          {dropPct != null
                            ? `${dropPct < 0 ? '' : '+'}${Math.abs(dropPct).toFixed(1)}%`
                            : '—'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stage bar row */}
                  <div className="flex items-center gap-3">
                    {/* Label — fixed width, right-aligned */}
                    <span
                      className="w-28 shrink-0 text-right text-[12px] font-medium"
                      style={{ color: '#9ca3af' }}
                    >
                      {stage.label}
                    </span>

                    {/* Funnel bar — centered within flex-1 */}
                    <div className="relative flex-1">
                      <div
                        className="h-9 rounded-md transition-[width] duration-500"
                        style={{
                          width:           `${widthPct}%`,
                          backgroundColor: '#3b82f6',
                          opacity:         BAR_OPACITIES[i],
                        }}
                      />
                    </div>

                    {/* Raw value — fixed width, right-aligned */}
                    <span
                      className="w-16 shrink-0 text-right font-mono text-[13px] font-semibold"
                      style={{ color: '#f9fafb' }}
                    >
                      {fmtNum(stage.value)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Conversion rate chips ─────────────────────────────────────── */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: '#6b7280' }}>Conversion:</span>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}
            >
              View → Profile:{' '}
              {viewToProfile != null ? `${viewToProfile.toFixed(1)}%` : '—'}
            </span>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}
            >
              {endChipLabel}:{' '}
              {profileToEnd != null ? `${profileToEnd.toFixed(1)}%` : '—'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
