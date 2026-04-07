'use client'

import { Search } from 'lucide-react'
import type { DmConversation, ConversationStatus } from '@/types/dms'

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<ConversationStatus, { label: string; color: string; bg: string }> = {
  new:          { label: 'New',         color: '#60a5fa', bg: 'rgba(37,99,235,0.15)'   },
  qualifying:   { label: 'Qualifying',  color: '#a78bfa', bg: 'rgba(139,92,246,0.15)'  },
  qualified:    { label: 'Qualified',   color: '#34d399', bg: 'rgba(16,185,129,0.15)'  },
  disqualified: { label: 'Disqualified',color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  booked:       { label: 'Booked',      color: '#c084fc', bg: 'rgba(192,132,252,0.15)' },
  no_show:      { label: 'No Show',     color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  closed_won:   { label: 'Won',         color: '#4ade80', bg: 'rgba(74,222,128,0.15)'  },
  closed_lost:  { label: 'Lost',        color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  follow_up:    { label: 'Follow-Up',   color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  nurture:      { label: 'Nurture',     color: '#fb923c', bg: 'rgba(251,146,60,0.15)'  },
}

const FILTER_TABS: { key: string; label: string; status?: ConversationStatus }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'unread',    label: 'Unread'    },
  { key: 'new',       label: 'New Lead',  status: 'new'       },
  { key: 'qualified', label: 'Qualified', status: 'qualified' },
  { key: 'booked',    label: 'Booked',    status: 'booked'    },
  { key: 'follow_up', label: 'Follow-Up', status: 'follow_up' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Avatar({ conversation, size = 40 }: { conversation: DmConversation; size?: number }) {
  const label = (conversation.ig_username ?? conversation.ig_user_id).slice(0, 2).toUpperCase()
  if (conversation.ig_profile_pic) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={conversation.ig_profile_pic}
        alt={label}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      backgroundColor: 'rgba(37,99,235,0.2)', color: '#60a5fa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700,
    }}>
      {label}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConversationListProps {
  conversations: DmConversation[]
  loading: boolean
  selectedId: string | null
  activeFilter: string
  search: string
  onFilterChange: (filter: string) => void
  onSearchChange: (s: string) => void
  onSelect: (conv: DmConversation) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConversationList({
  conversations,
  loading,
  selectedId,
  activeFilter,
  search,
  onFilterChange,
  onSearchChange,
  onSelect,
}: ConversationListProps) {
  return (
    <div style={{
      width: 280, flexShrink: 0,
      backgroundColor: '#0d1117',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
    }}>
      {/* Filter tabs */}
      <div style={{
        padding: '10px 10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', paddingBottom: 10 }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              style={{
                padding: '3px 9px', borderRadius: 5, fontSize: 11.5, fontWeight: activeFilter === tab.key ? 600 : 400,
                color: activeFilter === tab.key ? '#f9fafb' : '#6b7280',
                backgroundColor: activeFilter === tab.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: activeFilter === tab.key ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', paddingBottom: 10 }}>
          <Search style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            width: 13, height: 13, color: '#4b5563', pointerEvents: 'none',
          }} />
          <input
            type="text"
            placeholder="Search username…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%', paddingLeft: 28, paddingRight: 10,
              paddingTop: 6, paddingBottom: 6,
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 7, fontSize: 12.5, color: '#f9fafb',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Conversation items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          // Skeleton
          <div style={{ padding: '8px 0' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, width: '60%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 6 }} />
                  <div style={{ height: 10, width: '80%', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#4b5563', fontSize: 12.5 }}>
            No conversations
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = conv.id === selectedId
            const isUnread   = conv.unread_count > 0
            const status     = STATUS_CONFIG[conv.status] ?? STATUS_CONFIG.new
            const username   = conv.ig_username ?? conv.ig_user_id

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(37,99,235,0.08)' : 'transparent',
                  borderLeft: isSelected ? '2px solid #2563eb' : '2px solid transparent',
                  borderTop: 'none', borderRight: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  transition: 'all 0.1s',
                }}
              >
                <Avatar conversation={conv} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Top row: name + time */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{
                      fontSize: 13, fontWeight: isUnread ? 700 : 500,
                      color: isUnread ? '#f9fafb' : '#e5e7eb',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120,
                    }}>
                      @{username}
                    </span>
                    <span style={{ fontSize: 10.5, color: '#4b5563', flexShrink: 0 }}>
                      {formatRelativeTime(conv.last_message_at)}
                    </span>
                  </div>

                  {/* Bottom row: status + unread dot */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '1px 6px', borderRadius: 4,
                      backgroundColor: status.bg, color: status.color,
                    }}>
                      {status.label}
                    </span>
                    {isUnread && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        backgroundColor: '#2563eb', flexShrink: 0,
                      }} />
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
