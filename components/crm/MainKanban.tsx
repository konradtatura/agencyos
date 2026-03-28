'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { MAIN_PIPELINE_STAGES, type Lead, type LeadStage } from '@/types/crm'
import LeadCard from './LeadCard'
import { Skeleton } from '@/components/ui/skeleton'

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  dmd:         { label: "DM'd",        color: '#6366f1' },
  qualifying:  { label: 'Qualifying',  color: '#8b5cf6' },
  qualified:   { label: 'Qualified',   color: '#2563eb' },
  call_booked: { label: 'Call Booked', color: '#0ea5e9' },
  showed:      { label: 'Showed',      color: '#f59e0b' },
  closed_won:  { label: 'Closed Won',  color: '#10b981' },
  closed_lost: { label: 'Closed Lost', color: '#ef4444' },
  follow_up:   { label: 'Follow-Up',   color: '#f97316' },
  nurture:     { label: 'Nurture',     color: '#14b8a6' },
}

interface MainKanbanProps {
  /** Called with the total lead count after each fetch */
  onLeadCountChange?: (count: number) => void
}

export default function MainKanban({ onLeadCountChange }: MainKanbanProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Keep a ref to the current leads so the drag handler can read the
  // pre-drag state without declaring leads as a dependency.
  const leadsRef = useRef(leads)
  useEffect(() => { leadsRef.current = leads }, [leads])

  const fetchLeads = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/crm/leads?pipeline_type=main')
      if (!res.ok) throw new Error('Failed to fetch leads')
      const data: Lead[] = await res.json()
      setLeads(data)
      onLeadCountChange?.(data.length)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [onLeadCountChange])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return

    const newStage = destination.droppableId as LeadStage
    const prevLeads = leadsRef.current

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, stage: newStage } : l))
    )

    try {
      const res = await fetch(`/api/crm/leads/${draggableId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_stage: newStage }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on failure
      setLeads(prevLeads)
    }
  }, [])

  const handleLeadDisqualified = useCallback(() => {
    // Refetch the board so the lead properly disappears (it may now be
    // pipeline_type='downgrade' or stage='dead', both absent from main board).
    setLoading(true)
    fetchLeads()
  }, [fetchLeads])

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24 }}>
        {MAIN_PIPELINE_STAGES.map((stage) => (
          <div key={stage} style={{ width: 240, minWidth: 240, flexShrink: 0 }}>
            <Skeleton
              style={{ height: 18, width: 100, marginBottom: 12, borderRadius: 6 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  style={{ height: 88, borderRadius: 10 }}
                />
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
          color: '#6b7280',
        }}
      >
        <p style={{ color: '#ef4444', fontSize: 13 }}>{fetchError}</p>
        <button
          onClick={() => { setLoading(true); fetchLeads() }}
          style={{
            fontSize: 12, color: '#2563eb',
            padding: '6px 16px', borderRadius: 6,
            border: '1px solid rgba(37,99,235,0.3)',
            backgroundColor: 'rgba(37,99,235,0.08)',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          overflowY: 'visible',
          paddingBottom: 24,
          paddingTop: 4,
          // Negative margin to extend to page edge on x without clipping shadow
          paddingLeft: 2,
          paddingRight: 2,
          minHeight: 'calc(100vh - 260px)',
        }}
      >
        {MAIN_PIPELINE_STAGES.map((stage) => {
          const cfg = STAGE_CONFIG[stage]
          const colLeads = leads.filter((l) => l.stage === stage)

          return (
            <div
              key={stage}
              style={{ width: 240, minWidth: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
            >
              {/* Column header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8, paddingLeft: 2, paddingRight: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Glowing dot */}
                  <div
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: cfg.color,
                      boxShadow: `0 0 6px ${cfg.color}99`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11.5, fontWeight: 600,
                      color: '#9ca3af', letterSpacing: '0.01em',
                    }}
                  >
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

              {/* Droppable column */}
              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      padding: '6px 4px',
                      borderRadius: 10,
                      minHeight: 120,
                      overflowY: 'auto',
                      maxHeight: 'calc(100vh - 290px)',
                      backgroundColor: snapshot.isDraggingOver
                        ? `${cfg.color}10`
                        : 'transparent',
                      border: colLeads.length === 0
                        ? `1.5px dashed rgba(255,255,255,0.07)`
                        : `1.5px solid ${snapshot.isDraggingOver ? `${cfg.color}30` : 'transparent'}`,
                      transition: 'background-color 0.15s, border-color 0.15s',
                    }}
                  >
                    {colLeads.length === 0 && !snapshot.isDraggingOver && (
                      <p
                        style={{
                          fontSize: 11, color: '#1f2937',
                          textAlign: 'center', paddingTop: 32,
                          pointerEvents: 'none', userSelect: 'none',
                        }}
                      >
                        No leads
                      </p>
                    )}

                    {colLeads.map((lead, index) => (
                      <Draggable
                        key={lead.id}
                        draggableId={lead.id}
                        index={index}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={dragProvided.draggableProps.style}
                          >
                            <LeadCard
                              lead={lead}
                              isDragging={dragSnapshot.isDragging}
                              onDisqualified={handleLeadDisqualified}
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
  )
}
