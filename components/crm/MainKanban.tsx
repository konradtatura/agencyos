'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { type Lead, type PipelineStage } from '@/types/crm'
import LeadCard from './LeadCard'
import { Skeleton } from '@/components/ui/skeleton'

interface MainKanbanProps {
  stages: PipelineStage[]
  onSelectLead: (id: string) => void
  onLeadCountChange?: (count: number) => void
  refreshKey?: number
}

export default function MainKanban({ stages, onSelectLead, onLeadCountChange, refreshKey }: MainKanbanProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const leadsRef = useRef(leads)
  useEffect(() => { leadsRef.current = leads }, [leads])

  // Normalize stage keys for comparison: "DM'd" → "dmd", "call_booked" → "callbooked"
  // leads.stage and pipeline_stages.name should be identical, but display-name edits break ===
  const normalizeStage = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  const fetchLeads = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/crm/leads')
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

  useEffect(() => {
    setLoading(true)
    fetchLeads()
  }, [fetchLeads, refreshKey])

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const newStage = destination.droppableId
    const prevLeads = leadsRef.current

    setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, stage: newStage } : l)))

    try {
      const res = await fetch(`/api/crm/leads/${draggableId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_stage: newStage }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setLeads(prevLeads)
    }
  }, [])

  const handleLeadDisqualified = useCallback(() => {
    setLoading(true)
    fetchLeads()
  }, [fetchLeads])

  const toggleCollapse = (stageName: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(stageName)) next.delete(stageName)
      else next.add(stageName)
      return next
    })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24 }}>
        {stages.slice(0, 6).map((s) => (
          <div key={s.id} style={{ width: 240, minWidth: 240, flexShrink: 0 }}>
            <Skeleton style={{ height: 18, width: 100, marginBottom: 12, borderRadius: 6 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 88, borderRadius: 10 }} />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (fetchError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <p style={{ color: '#ef4444', fontSize: 13 }}>{fetchError}</p>
        <button
          onClick={() => { setLoading(true); fetchLeads() }}
          style={{ fontSize: 12, color: '#2563eb', padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.08)', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  function stageAccentColor(name: string): string {
    const s = name.toLowerCase().replace(/[^a-z]/g, '')
    if (['dmd'].includes(s)) return '#6b7280'
    if (['qualifying', 'nurture'].includes(s)) return '#6b7280'
    if (['qualified'].includes(s)) return '#2563eb'
    if (['callbooked', 'booked'].includes(s)) return '#8b5cf6'
    if (['showed'].includes(s)) return '#f59e0b'
    if (['closedwon', 'closed'].includes(s)) return '#10b981'
    if (['closedlost', 'noshow', 'disqualified', 'dead'].includes(s)) return '#ef4444'
    return '#374151'
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        style={{
          display: 'flex', gap: 10,
          overflowX: 'auto', overflowY: 'visible',
          paddingBottom: 24, paddingTop: 4, paddingLeft: 2, paddingRight: 2,
          minHeight: 'calc(100vh - 260px)',
          alignItems: 'flex-start',
        }}
      >
        {stages.map((stage) => {
          const colLeads = leads.filter((l) => normalizeStage(l.stage) === normalizeStage(stage.name))
          const isCollapsed = collapsed.has(stage.name)

          if (isCollapsed) {
            // User explicitly collapsed this column
            return (
              <div
                key={stage.id}
                onClick={() => toggleCollapse(stage.name)}
                title={`${stage.name} (0 leads)`}
                style={{
                  width: 36, minWidth: 36, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  paddingTop: 10, cursor: 'pointer',
                  borderRadius: 8,
                  border: '1.5px dashed rgba(255,255,255,0.07)',
                  minHeight: 52,
                  transition: 'background-color 0.12s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                <div
                  style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: stage.color, marginBottom: 8,
                    boxShadow: `0 0 5px ${stage.color}80`,
                  }}
                />
                <span
                  style={{
                    fontSize: 9.5, fontWeight: 600, color: '#4b5563',
                    writingMode: 'vertical-rl', letterSpacing: '0.04em',
                    textTransform: 'capitalize',
                  }}
                >
                  {stage.name}
                </span>
                <span style={{ fontSize: 9, color: '#374151', marginTop: 6 }}>0</span>
              </div>
            )
          }

          return (
            <div
              key={stage.id}
              style={{
                width: 240, minWidth: 240, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                borderTop: `3px solid ${stageAccentColor(stage.name)}`,
                borderRadius: '0 0 8px 8px',
                paddingTop: 8,
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, paddingLeft: 2, paddingRight: 2,
                  cursor: 'pointer',
                }}
                onClick={() => toggleCollapse(stage.name)}
                title="Click to collapse"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: stage.color,
                      boxShadow: `0 0 6px ${stage.color}99`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.01em' }}>
                    {stage.name}
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

              <Droppable droppableId={stage.name}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', gap: 7,
                      padding: '6px 4px', borderRadius: 10, minHeight: 120,
                      overflowY: 'auto', maxHeight: 'calc(100vh - 260px)',
                      backgroundColor: snapshot.isDraggingOver ? `${stage.color}10` : 'transparent',
                      border: colLeads.length === 0
                        ? '1.5px dashed rgba(255,255,255,0.07)'
                        : `1.5px solid ${snapshot.isDraggingOver ? `${stage.color}30` : 'transparent'}`,
                      transition: 'background-color 0.15s, border-color 0.15s',
                    }}
                  >
                    {colLeads.length === 0 && !snapshot.isDraggingOver && (
                      <p style={{ fontSize: 11, color: '#374151', textAlign: 'center', paddingTop: 32, pointerEvents: 'none', userSelect: 'none' }}>
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
                            <LeadCard
                              lead={lead}
                              isDragging={dragSnapshot.isDragging}
                              onOpen={onSelectLead}
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
