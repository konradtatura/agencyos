'use client'

import { Droppable, Draggable } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import ContentCard from './ContentCard'
import type { ContentIdea, ContentStage } from '@/lib/content-pipeline/types'
import { STAGE_CONFIG } from '@/lib/content-pipeline/types'

interface KanbanColumnProps {
  stage: ContentStage
  ideas: ContentIdea[]
  onCardClick: (idea: ContentIdea) => void
  onAddNew: (stage: ContentStage) => void
}

export default function KanbanColumn({ stage, ideas, onCardClick, onAddNew }: KanbanColumnProps) {
  const cfg = STAGE_CONFIG[stage]

  return (
    <div style={{ width: 240, minWidth: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Column header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   8,
          paddingLeft:    2,
          paddingRight:   2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Glowing dot */}
          <div
            style={{
              width:           6,
              height:          6,
              borderRadius:    '50%',
              backgroundColor: cfg.color,
              boxShadow:       `0 0 6px ${cfg.color}99`,
              flexShrink:      0,
            }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.01em' }}>
            {cfg.label}
          </span>
        </div>

        {/* Count badge */}
        <span
          style={{
            fontSize:        10.5,
            fontWeight:      600,
            color:           '#4b5563',
            padding:         '1px 6px',
            borderRadius:    20,
            backgroundColor: 'rgba(255,255,255,0.04)',
            border:          '1px solid rgba(255,255,255,0.07)',
            minWidth:        20,
            textAlign:       'center',
          }}
        >
          {ideas.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex:            1,
              display:         'flex',
              flexDirection:   'column',
              gap:             7,
              padding:         '6px 4px',
              borderRadius:    10,
              minHeight:       120,
              overflowY:       'auto',
              maxHeight:       'calc(100vh - 300px)',
              backgroundColor: snapshot.isDraggingOver
                ? `${cfg.color}10`
                : 'transparent',
              border: ideas.length === 0
                ? '1.5px dashed rgba(255,255,255,0.07)'
                : `1.5px solid ${snapshot.isDraggingOver ? `${cfg.color}30` : 'transparent'}`,
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
          >
            {ideas.length === 0 && !snapshot.isDraggingOver && (
              <p
                style={{
                  fontSize:      11,
                  color:         '#1f2937',
                  textAlign:     'center',
                  paddingTop:    32,
                  pointerEvents: 'none',
                  userSelect:    'none',
                }}
              >
                No ideas here yet
              </p>
            )}

            {ideas.map((idea, index) => (
              <Draggable key={idea.id} draggableId={idea.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    style={dragProvided.draggableProps.style}
                  >
                    <ContentCard
                      idea={idea}
                      isDragging={dragSnapshot.isDragging}
                      onClick={() => onCardClick(idea)}
                    />
                  </div>
                )}
              </Draggable>
            ))}

            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* + New page button */}
      <button
        onClick={() => onAddNew(stage)}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             4,
          marginTop:       6,
          padding:         '6px 4px',
          fontSize:        12,
          color:           '#4b5563',
          backgroundColor: 'transparent',
          border:          'none',
          cursor:          'pointer',
          borderRadius:    6,
          width:           '100%',
          transition:      'color 0.12s, background-color 0.12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#9ca3af'
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#4b5563'
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <Plus size={12} strokeWidth={2} />
        New page
      </button>
    </div>
  )
}
