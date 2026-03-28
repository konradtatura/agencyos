'use client'

import { useMemo } from 'react'
import type { Snapshot } from './kpi-grid'

// Labels for known Instagram follow_type dimension values
const SOURCE_LABELS: Record<string, string> = {
  FEED:           'Feed',
  REEL:           'Reels',
  STORY:          'Stories',
  PROFILE:        'Profile',
  HASHTAG:        'Hashtags',
  SUGGESTED:      'Suggested',
  EXPLORE:        'Explore',
  OTHER:          'Other',
  DIRECT_MESSAGE: 'DMs',
  LIVE:           'Live',
  SEARCH:         'Search',
}

const SOURCE_COLORS: Record<string, string> = {
  FEED:           '#2563eb',
  REEL:           '#7c3aed',
  STORY:          '#0891b2',
  PROFILE:        '#059669',
  HASHTAG:        '#d97706',
  SUGGESTED:      '#db2777',
  EXPLORE:        '#65a30d',
  OTHER:          '#6b7280',
}

function getColor(key: string): string {
  return SOURCE_COLORS[key] ?? '#6b7280'
}

export default function FollowerSourceBreakdown({ snapshots }: { snapshots: Snapshot[] }) {
  const { entries, total } = useMemo(() => {
    // Use the most recent snapshot that has follower_source data
    const snap = snapshots.find((s) => s.follower_source && Object.keys(s.follower_source).length > 0)
    if (!snap?.follower_source) return { entries: [], total: 0 }

    const src = snap.follower_source
    const total = Object.values(src).reduce((a, b) => a + b, 0)
    const entries = Object.entries(src)
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => ({
        key,
        label: SOURCE_LABELS[key] ?? key,
        value,
        pct:   total > 0 ? (value / total) * 100 : 0,
        color: getColor(key),
      }))

    return { entries, total }
  }, [snapshots])

  const hasData = entries.length > 0

  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="mb-4">
        <p className="text-[13px] font-semibold text-[#f9fafb]">Follower Sources</p>
        <p className="mt-0.5 text-[11px] text-[#6b7280]">Where new followers come from</p>
      </div>

      {hasData ? (
        <div className="space-y-3">
          {entries.map(({ key, label, value, pct, color }) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#d1d5db]">{label}</span>
                <span className="font-mono text-[11px] text-[#6b7280]">
                  {value.toLocaleString()} · {pct.toFixed(1)}%
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          ))}
          {total > 0 && (
            <p className="pt-1 text-right text-[11px] text-[#4b5563]">
              {total.toLocaleString()} total new followers
            </p>
          )}
        </div>
      ) : (
        <div className="flex h-[160px] items-center justify-center">
          <p className="text-center text-[13px]" style={{ color: '#4b5563' }}>
            Source data unavailable.<br />
            Requires instagram_business_demographics permission.
          </p>
        </div>
      )}
    </div>
  )
}
