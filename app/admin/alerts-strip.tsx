'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

export interface AdminAlert {
  id:          string   // unique key: creatorId + alertType
  creatorId:   string
  creatorName: string
  issue:       string   // plain-English description
  severity:    'red' | 'amber'
  daysLabel?:  string   // e.g. "14d overdue" | "7d no leads"
}

const DISMISS_TTL = 24 * 60 * 60 * 1000  // 24 h in ms

export default function AlertsStrip({ alerts }: { alerts: AdminAlert[] }) {
  const [dismissed, setDismissed] = useState<Record<string, number>>({})
  const [mounted,   setMounted]   = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const raw = localStorage.getItem('admin_dismissed_alerts')
      if (!raw) return
      const parsed: Record<string, number> = JSON.parse(raw)
      const now   = Date.now()
      const valid: Record<string, number> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (now - v < DISMISS_TTL) valid[k] = v
      }
      setDismissed(valid)
    } catch { /* ignore */ }
  }, [])

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: Date.now() }
    setDismissed(next)
    try { localStorage.setItem('admin_dismissed_alerts', JSON.stringify(next)) } catch { /* ignore */ }
  }

  // During SSR hydration show everything; after mount apply dismissals
  const visible = mounted ? alerts.filter(a => !(a.id in dismissed)) : alerts

  // Sort: red first, then amber
  const sorted = [...visible].sort((a, b) => {
    if (a.severity === 'red' && b.severity !== 'red') return -1
    if (b.severity === 'red' && a.severity !== 'red') return 1
    return 0
  })

  if (sorted.length === 0) {
    return (
      <div
        className="mb-6 flex items-center gap-3 rounded-xl px-5 py-4"
        style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
      >
        <div className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
        <p className="text-[13px] font-medium text-[#10b981]">
          All creators operating normally — no active alerts.
        </p>
      </div>
    )
  }

  const redCount   = sorted.filter(a => a.severity === 'red').length
  const amberCount = sorted.filter(a => a.severity === 'amber').length

  return (
    <div
      className="mb-6 overflow-hidden rounded-xl"
      style={{
        backgroundColor: '#111827',
        border: redCount > 0
          ? '1px solid rgba(239,68,68,0.25)'
          : '1px solid rgba(245,158,11,0.25)',
      }}
    >
      {/* Strip header */}
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          backgroundColor: redCount > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.04)',
        }}
      >
        <span className="text-[14px]">{redCount > 0 ? '🔴' : '🟡'}</span>
        <p className="text-[12px] font-semibold text-[#f9fafb]">
          {sorted.length} Active Alert{sorted.length !== 1 ? 's' : ''}
        </p>
        {redCount > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}
          >
            {redCount} critical
          </span>
        )}
        {amberCount > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}
          >
            {amberCount} warning
          </span>
        )}
        <span className="ml-auto text-[11px] text-[#4b5563]">Dismissed alerts return after 24h if still active</span>
      </div>

      {/* Alert rows */}
      <div className="divide-y divide-[rgba(255,255,255,0.04)]">
        {sorted.map(alert => (
          <div
            key={alert.id}
            className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
          >
            <span className="shrink-0 text-[13px]">{alert.severity === 'red' ? '🔴' : '🟡'}</span>
            <p className="flex-1 min-w-0 text-[13px]">
              <span className="font-semibold text-[#f9fafb]">{alert.creatorName}</span>
              <span className="text-[#9ca3af]"> — {alert.issue}.</span>
            </p>
            {alert.daysLabel && (
              <span
                className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={alert.severity === 'red'
                  ? { backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }
                  : { backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24' }
                }
              >
                {alert.daysLabel}
              </span>
            )}
            <button
              onClick={() => dismiss(alert.id)}
              title="Dismiss for 24h"
              className="shrink-0 rounded-md p-1 text-[#374151] hover:text-[#9ca3af] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
