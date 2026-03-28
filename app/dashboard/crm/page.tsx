'use client'

import { useState, useCallback } from 'react'
import { Plus, Kanban, List, TrendingDown } from 'lucide-react'
import PageHeader from '@/components/ui/page-header'
import MainKanban from '@/components/crm/MainKanban'
import DowngradeKanban from '@/components/crm/DowngradeKanban'
import NewLeadModal from '@/components/crm/NewLeadModal'
import LeadListView from '@/components/crm/LeadListView'

type MainTab = 'pipeline' | 'list'
type PipelineSubTab = 'main' | 'downgrade'

// ── Tab primitives ──────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
  size = 'md',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  size?: 'md' | 'sm'
}) {
  if (size === 'sm') {
    return (
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 12px', borderRadius: 6, fontSize: 12,
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

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 7, fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#f9fafb' : '#6b7280',
        backgroundColor: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: active ? '1px solid rgba(255,255,255,0.09)' : '1px solid transparent',
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [mainTab, setMainTab] = useState<MainTab>('pipeline')
  const [pipelineTab, setPipelineTab] = useState<PipelineSubTab>('main')
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [totalLeads, setTotalLeads] = useState<number | null>(null)
  // Increment to force a MainKanban remount after a new lead is created
  const [kanbanKey, setKanbanKey] = useState(0)

  const handleNewLeadSuccess = useCallback(() => {
    setNewLeadOpen(false)
    setKanbanKey((k) => k + 1)
  }, [])

  return (
    <>
      <PageHeader
        title="Lead Pipeline"
        subtitle={
          totalLeads !== null
            ? `${totalLeads} lead${totalLeads !== 1 ? 's' : ''} in main pipeline`
            : 'CRM — Sales pipeline management'
        }
      >
        <button
          onClick={() => setNewLeadOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            backgroundColor: '#2563eb',
            color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 0 20px rgba(37,99,235,0.25)',
            transition: 'background-color 0.15s, box-shadow 0.15s',
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
          <Plus size={15} strokeWidth={2.5} />
          New Lead
        </button>
      </PageHeader>

      {/* Main tabs: Pipeline | List */}
      <div
        style={{
          display: 'flex', gap: 4, marginBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          paddingBottom: 12,
        }}
      >
        <TabButton active={mainTab === 'pipeline'} onClick={() => setMainTab('pipeline')}>
          <Kanban size={13} />
          Pipeline
        </TabButton>
        <TabButton active={mainTab === 'list'} onClick={() => setMainTab('list')}>
          <List size={13} />
          List View
        </TabButton>
      </div>

      {/* ── PIPELINE TAB ─────────────────────────────────────────────── */}
      {mainTab === 'pipeline' && (
        <>
          {/* Sub-tabs: Main | Downgrade */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            <TabButton
              size="sm"
              active={pipelineTab === 'main'}
              onClick={() => setPipelineTab('main')}
            >
              Main Pipeline
            </TabButton>
            <TabButton
              size="sm"
              active={pipelineTab === 'downgrade'}
              onClick={() => setPipelineTab('downgrade')}
            >
              <TrendingDown size={11} />
              Downgrade Pipeline
            </TabButton>
          </div>

          {pipelineTab === 'main' && (
            <MainKanban
              key={kanbanKey}
              onLeadCountChange={setTotalLeads}
            />
          )}

          {pipelineTab === 'downgrade' && <DowngradeKanban />}
        </>
      )}

      {/* ── LIST TAB ─────────────────────────────────────────────────── */}
      {mainTab === 'list' && (
        <LeadListView onSwitchToPipeline={() => setMainTab('pipeline')} />
      )}

      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onSuccess={handleNewLeadSuccess}
      />
    </>
  )
}
