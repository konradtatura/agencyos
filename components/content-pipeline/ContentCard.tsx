'use client'

import { FileText } from 'lucide-react'
import type { ContentIdea } from '@/lib/content-pipeline/types'
import { daysSince } from '@/lib/content-pipeline/types'

interface ContentCardProps {
  idea: ContentIdea
  isDragging?: boolean
  onClick: () => void
}

const PLATFORM_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  instagram: { label: 'Instagram', bg: 'rgba(244,63,94,0.12)',  color: '#fb7185' },
  youtube:   { label: 'YouTube',   bg: 'rgba(239,68,68,0.12)',  color: '#f87171' },
  both:      { label: 'Both',      bg: 'rgba(37,99,235,0.12)',  color: '#60a5fa' },
}

export default function ContentCard({ idea, isDragging, onClick }: ContentCardProps) {
  const staleDays = daysSince(idea.stage_entered_at)
  const platform = PLATFORM_BADGE[idea.platform] ?? PLATFORM_BADGE.instagram

  // Staleness border & glow
  let borderStyle = '1px solid rgba(255,255,255,0.06)'
  let boxShadow   = isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : 'none'
  let titleSuffix = ''

  if (staleDays > 7) {
    borderStyle = '1px solid rgba(239,68,68,0.6)'
    boxShadow   = `0 0 0 1px rgba(239,68,68,0.4)${isDragging ? ', 0 8px 24px rgba(0,0,0,0.4)' : ''}`
    titleSuffix = `In this stage for ${staleDays} days`
  } else if (staleDays > 3) {
    borderStyle = '1px solid rgba(245,158,11,0.6)'
    boxShadow   = `0 0 0 1px rgba(245,158,11,0.4)${isDragging ? ', 0 8px 24px rgba(0,0,0,0.4)' : ''}`
    titleSuffix = `In this stage for ${staleDays} days`
  }

  return (
    <div
      onClick={onClick}
      title={titleSuffix || undefined}
      style={{
        backgroundColor: '#111827',
        border:          borderStyle,
        boxShadow,
        borderRadius:    10,
        padding:         '10px 12px',
        cursor:          'pointer',
        transition:      'border-color 0.15s, box-shadow 0.15s, background-color 0.12s',
        userSelect:      'none',
        opacity:         isDragging ? 0.92 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.backgroundColor = '#1a2235'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#111827'
      }}
    >
      {/* Top row: icon + title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <FileText
          size={13}
          style={{ color: '#4b5563', marginTop: 1, flexShrink: 0 }}
        />
        <p
          style={{
            fontSize:     13,
            fontWeight:   500,
            color:        '#f9fafb',
            lineHeight:   '1.4',
            overflow:     'hidden',
            display:      '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            flex:         1,
          }}
        >
          {idea.title}
        </p>
      </div>

      {/* Bottom row: platform badge + stale indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <span
          style={{
            fontSize:        10.5,
            fontWeight:      500,
            padding:         '2px 8px',
            borderRadius:    20,
            backgroundColor: platform.bg,
            color:           platform.color,
          }}
        >
          {platform.label}
        </span>

        {staleDays > 3 && (
          <span
            style={{
              fontSize:  10,
              color:     staleDays > 7 ? '#f87171' : '#fbbf24',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {staleDays}d
          </span>
        )}
      </div>
    </div>
  )
}
