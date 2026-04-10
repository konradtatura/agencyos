'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Kanban, List, AlertTriangle, Users, Clock } from 'lucide-react'
import type { PipelineStage, LeadWithRelations, Lead } from '@/types/crm'
import MainKanban from './MainKanban'
import LeadListView from './LeadListView'
import LeadDrawer from './LeadDrawer'
import NewLeadModal from './NewLeadModal'

// ── Tab helpers ───────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 7, fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#f9fafb' : '#6b7280',
        backgroundColor: active ? 'rgba(255,255,255,0.07)' : 'transparent',
        border: active ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 20,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}25`,
        fontSize: 11.5, fontWeight: 500,
        color,
      }}
    >
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </span>
      <span style={{ color: `${color}99` }}>{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CRMShell() {
  const [view,         setView]         = useState<'kanban' | 'table'>('kanban')
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [newLeadOpen,  setNewLeadOpen]  = useState(false)
  const [refreshKey,   setRefreshKey]   = useState(0)

  // Stages from DB
  const [mainStages,      setMainStages]      = useState<PipelineStage[]>([])
  const [downgradeStages, setDowngradeStages] = useState<PipelineStage[]>([])
  const [allStages,       setAllStages]       = useState<PipelineStage[]>([])
  const [stagesLoading,   setStagesLoading]   = useState(true)

  // Stats
  const [stats, setStats] = useState<{ total: number; overdue: number; uncontacted: number } | null>(null)

  // Load stages on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/crm/stages?pipeline_type=main').then((r) => r.json()),
      fetch('/api/crm/stages?pipeline_type=downgrade').then((r) => r.json()),
    ])
      .then(([main, downgrade]) => {
        if (Array.isArray(main))      setMainStages(main)
        if (Array.isArray(downgrade)) setDowngradeStages(downgrade)
        if (Array.isArray(main) && Array.isArray(downgrade)) {
          setAllStages([...main, ...downgrade])
        }
      })
      .catch(() => {})
      .finally(() => setStagesLoading(false))
  }, [])

  // Load stats (lightweight lead fetch for chips)
  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch('/api/crm/leads')
      if (!res.ok) return
      const data: Lead[] = await res.json()
      const now  = new Date()
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      setStats({
        total:       data.length,
        overdue:     data.filter((l) => l.follow_up_date && new Date(l.follow_up_date) < now).length,
        uncontacted: data.filter((l) => l.stage === 'dmd' && new Date(l.updated_at) < cutoff).length,
      })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats, refreshKey])

  const handleLeadUpdated = useCallback((updated: LeadWithRelations) => {
    // Refresh stats after drawer updates
    fetchStats()
  }, [fetchStats])

  const handleNewLeadSuccess = useCallback(() => {
    setNewLeadOpen(false)
    setRefreshKey((k) => k + 1)
  }, [])

  // Stable reference — must not be an inline arrow or it recreates fetchLeads
  // in MainKanban on every render, causing an infinite loading loop.
  const handleLeadCountChange = useCallback((n: number) => {
    setStats((s) => s ? { ...s, total: n } : null)
  }, [])

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12, marginBottom: 14,
          }}
        >
          {/* Left: title + stat chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb', margin: 0 }}>
              Lead Pipeline
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {stats && (
                <>
                  <StatChip label="total" value={stats.total} color="#9ca3af" />
                  {stats.overdue > 0 && (
                    <StatChip label="overdue" value={stats.overdue} color="#f59e0b" />
                  )}
                  {stats.uncontacted > 0 && (
                    <StatChip label="uncontacted >24h" value={stats.uncontacted} color="#ef4444" />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: view toggle + new lead */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* View toggle */}
            <div
              style={{
                display: 'flex', gap: 2,
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: 2,
              }}
            >
              <TabBtn active={view === 'kanban'} onClick={() => setView('kanban')}>
                <Kanban size={13} />
                Kanban
              </TabBtn>
              <TabBtn active={view === 'table'} onClick={() => setView('table')}>
                <List size={13} />
                Table
              </TabBtn>
            </div>

            {/* New lead */}
            <button
              onClick={() => setNewLeadOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                backgroundColor: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 0 20px rgba(37,99,235,0.25)', transition: 'background-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1d4ed8'
                e.currentTarget.style.boxShadow = '0 0 28px rgba(37,99,235,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb'
                e.currentTarget.style.boxShadow = '0 0 20px rgba(37,99,235,0.25)'
              }}
            >
              <Plus size={14} strokeWidth={2.5} />
              New Lead
            </button>
          </div>
        </div>

      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      {!stagesLoading && (
        <>
          {view === 'kanban' && (
            <MainKanban
              stages={allStages}
              onSelectLead={setSelectedId}
              onLeadCountChange={handleLeadCountChange}
              refreshKey={refreshKey}
            />
          )}
          {view === 'table' && (
            <LeadListView
              stages={allStages}
              onSelectLead={setSelectedId}
              selectedLeadId={selectedId}
              refreshKey={refreshKey}
            />
          )}
        </>
      )}

      {/* ── Drawer ────────────────────────────────────────────────────── */}
      <LeadDrawer
        leadId={selectedId}
        stages={allStages}
        onClose={() => setSelectedId(null)}
        onLeadUpdated={handleLeadUpdated}
      />

      {/* ── New lead modal ─────────────────────────────────────────────── */}
      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onSuccess={handleNewLeadSuccess}
      />
    </>
  )
}
