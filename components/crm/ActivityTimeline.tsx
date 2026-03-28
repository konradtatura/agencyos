'use client'

import { MessageSquare, ArrowRight, Plus } from 'lucide-react'
import type { LeadStageHistory, LeadNote } from '@/types/crm'

const STAGE_LABELS: Record<string, string> = {
  dmd: "DM'd",
  qualifying: 'Qualifying',
  qualified: 'Qualified',
  call_booked: 'Call Booked',
  showed: 'Showed',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  follow_up: 'Follow-Up',
  nurture: 'Nurture',
  disqualified: 'Disqualified',
  dead: 'Dead',
  offered: 'Offered',
  interested: 'Interested',
  booked: 'Booked',
  closed: 'Closed',
}

const STAGE_COLORS: Record<string, string> = {
  dmd: '#6366f1',
  qualifying: '#8b5cf6',
  qualified: '#2563eb',
  call_booked: '#0ea5e9',
  showed: '#f59e0b',
  closed_won: '#10b981',
  closed_lost: '#ef4444',
  follow_up: '#f97316',
  nurture: '#14b8a6',
  disqualified: '#9ca3af',
  dead: '#4b5563',
  offered: '#6366f1',
  interested: '#8b5cf6',
  booked: '#f59e0b',
  closed: '#10b981',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

type TimelineItem =
  | { type: 'stage'; data: LeadStageHistory; ts: number }
  | { type: 'note'; data: LeadNote; ts: number }

interface ActivityTimelineProps {
  history: LeadStageHistory[]
  notes: LeadNote[]
  userNames: Record<string, string>
}

export default function ActivityTimeline({ history, notes, userNames }: ActivityTimelineProps) {
  const items: TimelineItem[] = [
    ...history.map((h) => ({ type: 'stage' as const, data: h, ts: new Date(h.changed_at).getTime() })),
    ...notes.map((n) => ({ type: 'note' as const, data: n, ts: new Date(n.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts)

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#374151', textAlign: 'center', padding: '24px 0' }}>
        No activity yet
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1

        if (item.type === 'stage') {
          const h = item.data
          const toColor = STAGE_COLORS[h.to_stage] ?? '#6b7280'
          const fromLabel = h.from_stage ? (STAGE_LABELS[h.from_stage] ?? h.from_stage) : null
          const fromColor = h.from_stage ? (STAGE_COLORS[h.from_stage] ?? '#6b7280') : '#6b7280'
          const toLabel = STAGE_LABELS[h.to_stage] ?? h.to_stage
          const actor = h.changed_by ? (userNames[h.changed_by] ?? null) : null

          return (
            <div key={h.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
              {!isLast && (
                <div
                  style={{
                    position: 'absolute', left: 13, top: 28, bottom: 0,
                    width: 1, backgroundColor: 'rgba(255,255,255,0.05)',
                  }}
                />
              )}
              <div
                style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: `${toColor}18`,
                  border: `1px solid ${toColor}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1,
                }}
              >
                {fromLabel
                  ? <ArrowRight size={11} color={toColor} strokeWidth={2.5} />
                  : <Plus size={11} color={toColor} strokeWidth={2.5} />
                }
              </div>
              <div style={{ flex: 1, paddingBottom: 18 }}>
                <p style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>
                  {fromLabel ? (
                    <>
                      Moved from{' '}
                      <span style={{ color: fromColor, fontWeight: 600 }}>{fromLabel}</span>
                      {' '}to{' '}
                      <span style={{ color: toColor, fontWeight: 600 }}>{toLabel}</span>
                    </>
                  ) : (
                    <>
                      Added to pipeline as{' '}
                      <span style={{ color: toColor, fontWeight: 600 }}>{toLabel}</span>
                    </>
                  )}
                </p>
                {h.note && (
                  <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>
                    &ldquo;{h.note}&rdquo;
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  {actor && (
                    <>
                      <span style={{ fontSize: 10.5, color: '#4b5563' }}>{actor}</span>
                      <span style={{ fontSize: 10, color: '#1f2937' }}>·</span>
                    </>
                  )}
                  <span style={{ fontSize: 10.5, color: '#374151' }}>
                    {relativeTime(h.changed_at)}
                  </span>
                </div>
              </div>
            </div>
          )
        }

        const n = item.data
        const author = n.author_id ? (userNames[n.author_id] ?? null) : null

        return (
          <div key={n.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {!isLast && (
              <div
                style={{
                  position: 'absolute', left: 13, top: 28, bottom: 0,
                  width: 1, backgroundColor: 'rgba(255,255,255,0.05)',
                }}
              />
            )}
            <div
              style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                backgroundColor: 'rgba(107,114,128,0.12)',
                border: '1px solid rgba(107,114,128,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1,
              }}
            >
              <MessageSquare size={11} color="#6b7280" strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, paddingBottom: 18 }}>
              <p
                style={{
                  fontSize: 12, color: '#9ca3af', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                {n.note_text}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                {author && (
                  <>
                    <span style={{ fontSize: 10.5, color: '#4b5563' }}>{author}</span>
                    <span style={{ fontSize: 10, color: '#1f2937' }}>·</span>
                  </>
                )}
                <span style={{ fontSize: 10.5, color: '#374151' }}>
                  {relativeTime(n.created_at)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
