'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'
import { DOWNGRADE_PIPELINE_STAGES, type Lead, type DowngradeStage } from '@/types/crm'
import { Skeleton } from '@/components/ui/skeleton'

// ── Stage config ─────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<DowngradeStage, { label: string; color: string }> = {
  offered:    { label: 'Offered',    color: '#6366f1' },
  interested: { label: 'Interested', color: '#8b5cf6' },
  booked:     { label: 'Booked',     color: '#f59e0b' },
  closed:     { label: 'Closed',     color: '#10b981' },
  dead:       { label: 'Dead',       color: '#4b5563' },
}

const TIER_CONFIG = {
  ht: { label: 'HT', bg: 'rgba(37,99,235,0.18)',   color: '#60a5fa',  border: 'rgba(37,99,235,0.35)'  },
  mt: { label: 'MT', bg: 'rgba(245,158,11,0.18)',  color: '#fbbf24',  border: 'rgba(245,158,11,0.35)' },
  lt: { label: 'LT', bg: 'rgba(16,185,129,0.18)',  color: '#34d399',  border: 'rgba(16,185,129,0.35)' },
}

// ── Mini card ────────────────────────────────────────────────────────────────

function DowngradeCard({ lead, isDragging }: { lead: Lead; isDragging: boolean }) {
  const router = useRouter()
  const tier = lead.offer_tier ? TIER_CONFIG[lead.offer_tier] : null
  const days = Math.max(0, Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86_400_000))

  function getInitials(name: string) {
    return name.trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/dashboard/crm/${lead.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/dashboard/crm/${lead.id}`)}
      style={{
        backgroundColor: isDragging ? '#111827' : '#0d1117',
        border: `1px solid ${isDragging ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 10,
        padding: '10px 11px',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: isDragging
          ? '0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.15)'
          : '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        outline: 'none',
      }}
    >
      {/* Row 1: avatar + name + tier badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
        <div
          aria-hidden
          style={{
            flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
            backgroundColor: '#1a2742',
            border: '1px solid rgba(37,99,235,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: '#7aa2f7',
          }}
        >
          {getInitials(lead.name)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 12, fontWeight: 600, color: '#e5e7eb', lineHeight: 1.25,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {lead.name}
          </p>
          {lead.ig_handle && (
            <p
              style={{
                fontSize: 10.5, color: '#4b5563', marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              @{lead.ig_handle}
            </p>
          )}
        </div>

        {tier && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              padding: '2px 5px', borderRadius: 4,
              backgroundColor: tier.bg, color: tier.color,
              border: `1px solid ${tier.border}`,
            }}
          >
            {tier.label}
          </span>
        )}
      </div>

      {/* Row 2: days indicator */}
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 10, color: '#374151',
        }}
      >
        <Clock size={9} strokeWidth={2.5} />
        {days === 0 ? 'Today' : `${days}d`}
      </span>
    </div>
  )
}

// ── Summary pill ─────────────────────────────────────────────────────────────

function SummaryPill({ leads }: { leads: Lead[] }) {
  const total = leads.length
  const mt = leads.filter((l) => l.offer_tier === 'mt').length
  const lt = leads.filter((l) => l.offer_tier === 'lt').length

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 0,
        borderRadius: 20, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.07)',
        marginBottom: 16, fontSize: 11.5, fontWeight: 500,
      }}
    >
      <span
        style={{
          padding: '4px 12px',
          backgroundColor: 'rgba(255,255,255,0.04)',
          color: '#9ca3af',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {total} total
      </span>
      <span
        style={{
          padding: '4px 12px',
          backgroundColor: 'rgba(245,158,11,0.06)',
          color: '#fbbf24',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {mt} MT
      </span>
      <span
        style={{
          padding: '4px 12px',
          backgroundColor: 'rgba(16,185,129,0.06)',
          color: '#34d399',
        }}
      >
        {lt} LT
      </span>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DowngradeKanban() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const leadsRef = useRef(leads)
  useEffect(() => { leadsRef.current = leads }, [leads])

  const fetchLeads = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/crm/leads?pipeline_type=downgrade')
      if (!res.ok) throw new Error('Failed to fetch downgrade leads')
      const data: Lead[] = await res.json()
      setLeads(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return

    const newStage = destination.droppableId as DowngradeStage
    const prevLeads = leadsRef.current

    // Optimistic update on downgrade_stage
    setLeads((prev) =>
      prev.map((l) => l.id === draggableId ? { ...l, downgrade_stage: newStage } : l)
    )

    try {
      // Update downgrade_stage field via PATCH
      const patchRes = await fetch(`/api/crm/leads/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downgrade_stage: newStage }),
      })
      if (!patchRes.ok) throw new Error()

      // Log the move in lead_stage_history via the stage endpoint
      await fetch(`/api/crm/leads/${draggableId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_stage: newStage,
          note: `Downgrade pipeline: ${newStage}`,
          pipeline: 'downgrade',
        }),
      })
    } catch {
      setLeads(prevLeads)
    }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24 }}>
        {DOWNGRADE_PIPELINE_STAGES.map((stage) => (
          <div key={stage} style={{ width: 240, minWidth: 240, flexShrink: 0 }}>
            <Skeleton style={{ height: 18, width: 90, marginBottom: 12, borderRadius: 6 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} style={{ height: 76, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (fetchError) {
    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 12, padding: 48,
          border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
        }}
      >
        <p style={{ color: '#ef4444', fontSize: 13 }}>{fetchError}</p>
        <button
          onClick={() => { setLoading(true); fetchLeads() }}
          style={{
            fontSize: 12, color: '#2563eb', padding: '6px 16px', borderRadius: 6,
            border: '1px solid rgba(37,99,235,0.3)',
            backgroundColor: 'rgba(37,99,235,0.08)', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <SummaryPill leads={leads} />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          style={{
            display: 'flex', gap: 12,
            overflowX: 'auto', overflowY: 'visible',
            paddingBottom: 24, paddingTop: 4, paddingLeft: 2, paddingRight: 2,
            minHeight: 'calc(100vh - 290px)',
          }}
        >
          {DOWNGRADE_PIPELINE_STAGES.map((stage) => {
            const cfg = STAGE_CONFIG[stage]
            const colLeads = leads.filter((l) => l.downgrade_stage === stage)

            return (
              <div
                key={stage}
                style={{ width: 240, minWidth: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
              >
                {/* Column header */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 8, paddingLeft: 2, paddingRight: 2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        backgroundColor: cfg.color,
                        boxShadow: stage !== 'dead' ? `0 0 6px ${cfg.color}99` : 'none',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af' }}>
                      {cfg.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5, fontWeight: 600, color: '#4b5563',
                      padding: '1px 6px', borderRadius: 20,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      minWidth: 20, textAlign: 'center',
                    }}
                  >
                    {colLeads.length}
                  </span>
                </div>

                <Droppable droppableId={stage}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        flex: 1,
                        display: 'flex', flexDirection: 'column', gap: 7,
                        padding: '6px 4px', borderRadius: 10, minHeight: 120,
                        overflowY: 'auto', maxHeight: 'calc(100vh - 310px)',
                        backgroundColor: snapshot.isDraggingOver
                          ? `${cfg.color}10`
                          : 'transparent',
                        border: colLeads.length === 0
                          ? '1.5px dashed rgba(255,255,255,0.07)'
                          : `1.5px solid ${snapshot.isDraggingOver ? `${cfg.color}30` : 'transparent'}`,
                        transition: 'background-color 0.15s, border-color 0.15s',
                      }}
                    >
                      {colLeads.length === 0 && !snapshot.isDraggingOver && (
                        <p
                          style={{
                            fontSize: 11, color: '#1f2937', textAlign: 'center',
                            paddingTop: 32, pointerEvents: 'none', userSelect: 'none',
                          }}
                        >
                          No leads
                        </p>
                      )}

                      {colLeads.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              style={dragProvided.draggableProps.style}
                            >
                              <DowngradeCard
                                lead={lead}
                                isDragging={dragSnapshot.isDragging}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}

                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>
    </>
  )
}
