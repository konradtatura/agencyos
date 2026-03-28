'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import type {
  ContentIdea,
  ContentStage,
  PlatformFilter,
} from '@/lib/content-pipeline/types'
import { CONTENT_STAGES } from '@/lib/content-pipeline/types'
import { Skeleton } from '@/components/ui/skeleton'
import KanbanColumn from './KanbanColumn'
import ContentDetailSheet from './ContentDetailSheet'
import FilterBar from './FilterBar'

export default function KanbanBoard() {
  const [ideas,      setIdeas]      = useState<ContentIdea[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [filter,     setFilter]     = useState<PlatformFilter>('all')
  const [selected,   setSelected]   = useState<ContentIdea | null>(null)

  const ideasRef = useRef(ideas)
  useEffect(() => { ideasRef.current = ideas }, [ideas])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchIdeas = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/content-ideas')
      if (!res.ok) throw new Error('Failed to fetch ideas')
      const data: ContentIdea[] = await res.json()
      setIdeas(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchIdeas() }, [fetchIdeas])

  // ── Supabase real-time ─────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('content_ideas_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'content_ideas' },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload as unknown as {
            eventType: 'INSERT' | 'UPDATE' | 'DELETE'
            new: ContentIdea
            old: { id: string }
          }

          if (eventType === 'INSERT') {
            setIdeas((prev) => {
              if (prev.some((i) => i.id === newRow.id)) return prev
              return [newRow, ...prev]
            })
          } else if (eventType === 'UPDATE') {
            setIdeas((prev) =>
              prev.map((i) => (i.id === newRow.id ? newRow : i))
            )
            // Sync sheet if open
            setSelected((prev) => (prev?.id === newRow.id ? newRow : prev))
          } else if (eventType === 'DELETE') {
            setIdeas((prev) => prev.filter((i) => i.id !== oldRow.id))
            setSelected((prev) => (prev?.id === oldRow.id ? null : prev))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return

    const newStage = destination.droppableId as ContentStage
    const prevIdeas = ideasRef.current

    // Optimistic update
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === draggableId
          ? { ...i, stage: newStage, stage_entered_at: new Date().toISOString() }
          : i
      )
    )

    try {
      const res = await fetch(`/api/content-ideas/${draggableId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stage: newStage }),
      })
      if (!res.ok) throw new Error()
      const updated: ContentIdea = await res.json()
      setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
      setSelected((prev) => (prev?.id === updated.id ? updated : prev))
    } catch {
      setIdeas(prevIdeas)
    }
  }, [])

  // ── Create new idea ────────────────────────────────────────────────────────
  const handleAddNew = useCallback(async (stage: ContentStage) => {
    try {
      const res = await fetch('/api/content-ideas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: 'Untitled idea', stage }),
      })
      if (!res.ok) throw new Error()
      const created: ContentIdea = await res.json()
      setIdeas((prev) => [created, ...prev])
      setSelected(created)
    } catch {
      // ignore
    }
  }, [])

  // ── Filtered ideas ─────────────────────────────────────────────────────────
  const filteredIdeas =
    filter === 'all'
      ? ideas
      : ideas.filter((i) => i.platform === filter)

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <Skeleton style={{ height: 32, width: 280, borderRadius: 20 }} />
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24 }}>
          {CONTENT_STAGES.map((stage) => (
            <div key={stage} style={{ width: 240, minWidth: 240, flexShrink: 0 }}>
              <Skeleton style={{ height: 18, width: 110, marginBottom: 12, borderRadius: 6 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} style={{ height: 80, borderRadius: 10 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            12,
          padding:        48,
          border:         '1px dashed rgba(255,255,255,0.08)',
          borderRadius:   12,
          color:          '#6b7280',
        }}
      >
        <p style={{ color: '#ef4444', fontSize: 13 }}>{fetchError}</p>
        <button
          onClick={() => { setLoading(true); fetchIdeas() }}
          style={{
            fontSize:        12,
            color:           '#2563eb',
            padding:         '6px 16px',
            borderRadius:    6,
            border:          '1px solid rgba(37,99,235,0.3)',
            backgroundColor: 'rgba(37,99,235,0.08)',
            cursor:          'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Filter bar */}
      <div style={{ marginBottom: 20 }}>
        <FilterBar value={filter} onChange={setFilter} />
      </div>

      {/* Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          style={{
            display:       'flex',
            gap:           12,
            overflowX:     'auto',
            overflowY:     'visible',
            paddingBottom: 24,
            paddingTop:    4,
            paddingLeft:   2,
            paddingRight:  2,
            minHeight:     'calc(100vh - 280px)',
          }}
        >
          {CONTENT_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              ideas={filteredIdeas.filter((i) => i.stage === stage)}
              onCardClick={setSelected}
              onAddNew={handleAddNew}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Detail sheet */}
      <ContentDetailSheet
        idea={selected}
        onClose={() => setSelected(null)}
        onUpdate={(updated) => {
          setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          setSelected(updated)
        }}
        onDelete={(id) => {
          setIdeas((prev) => prev.filter((i) => i.id !== id))
          setSelected(null)
        }}
      />
    </>
  )
}
