'use client'

import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import MetricsDashboard from './MetricsDashboard'
import TrackingScriptPanel from './TrackingScriptPanel'
import FunnelStatsView from './FunnelStatsView'

type Tab = 'sales' | 'funnel'

export default function MetricsPage() {
  const [tab, setTab] = useState<Tab>('sales')

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-[#2563eb]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#f9fafb]">Conversion Metrics</h1>
          <p className="text-sm text-[#9ca3af]">Sales team performance — DMs to close</p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 mb-6 rounded-lg p-1 w-fit"
        style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {([
          { value: 'sales',  label: 'Sales Team' },
          { value: 'funnel', label: 'Funnel'     },
        ] as { value: Tab; label: string }[]).map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="text-sm px-4 py-1.5 rounded-md font-medium transition-colors"
            style={{
              backgroundColor: tab === t.value ? '#2563eb' : 'transparent',
              color: tab === t.value ? '#fff' : '#9ca3af',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'sales' && <MetricsDashboard />}

      {tab === 'funnel' && (
        <div>
          <TrackingScriptPanel />
          <FunnelStatsView />
        </div>
      )}
    </div>
  )
}
