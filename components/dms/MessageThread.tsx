'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Lock } from 'lucide-react'
import type { DmConversation, DmMessage } from '@/types/dms'
import { STATUS_CONFIG } from './ConversationList'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: DmMessage }) {
  const isInbound  = message.direction === 'inbound'
  const isInternal = message.is_internal_note
  const isOutbound = message.direction === 'outbound' && !isInternal

  if (isInternal) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <div style={{
          maxWidth: '70%', padding: '7px 12px', borderRadius: 10,
          backgroundColor: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Lock style={{ width: 10, height: 10, color: '#d97706' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Internal note
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#fcd34d', margin: 0, lineHeight: 1.45 }}>
            {message.message_text}
          </p>
          <span style={{ fontSize: 10, color: 'rgba(252,211,77,0.5)', marginTop: 3, display: 'block' }}>
            {formatTime(message.sent_at)}
          </span>
        </div>
      </div>
    )
  }

  if (isOutbound) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{
          maxWidth: '70%', padding: '8px 12px', borderRadius: '12px 12px 3px 12px',
          backgroundColor: '#2563eb',
        }}>
          <p style={{ fontSize: 13.5, color: '#fff', margin: 0, lineHeight: 1.45 }}>
            {message.message_text}
          </p>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 3, display: 'block', textAlign: 'right' }}>
            {formatTime(message.sent_at)}
          </span>
        </div>
      </div>
    )
  }

  // Inbound
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '70%', padding: '8px 12px', borderRadius: '12px 12px 12px 3px',
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <p style={{ fontSize: 13.5, color: '#e5e7eb', margin: 0, lineHeight: 1.45 }}>
          {message.message_text}
        </p>
        <span style={{ fontSize: 10, color: '#4b5563', marginTop: 3, display: 'block' }}>
          {formatTime(message.sent_at)}
        </span>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MessageThreadProps {
  conversation: DmConversation | null
  messages: DmMessage[]
  messagesLoading: boolean
  onMessageSent: () => void
  onMarkRead: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MessageThread({
  conversation,
  messages,
  messagesLoading,
  onMessageSent,
  onMarkRead,
}: MessageThreadProps) {
  const [text,        setText]        = useState('')
  const [isNote,      setIsNote]      = useState(false)
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState<string | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom when messages load or new message arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, conversation?.id])

  // Mark as read when conversation opens
  useEffect(() => {
    if (conversation && conversation.unread_count > 0) {
      onMarkRead()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id])

  const handleSend = useCallback(async () => {
    if (!text.trim() || !conversation || sending) return
    setSending(true)
    setSendError(null)

    try {
      const res = await fetch(`/api/dms/${conversation.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), isInternalNote: isNote }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSendError((err as { error?: string }).error ?? 'Failed to send')
        return
      }

      setText('')
      onMessageSent()
    } catch {
      setSendError('Network error')
    } finally {
      setSending(false)
    }
  }, [text, conversation, sending, isNote, onMessageSent])

  // Cmd+Enter to send
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!conversation) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0a0f1e',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
            backgroundColor: 'rgba(37,99,235,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Send style={{ width: 20, height: 20, color: '#2563eb' }} />
          </div>
          <p style={{ color: '#4b5563', fontSize: 14, margin: 0 }}>Select a conversation</p>
        </div>
      </div>
    )
  }

  const status   = STATUS_CONFIG[conversation.status] ?? STATUS_CONFIG.new
  const username = conversation.ig_username ?? conversation.ig_user_id

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#0a0f1e' }}>
      {/* Thread header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>@{username}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
            backgroundColor: status.bg, color: status.color,
          }}>
            {status.label}
          </span>
        </div>
        {conversation.unread_count > 0 && (
          <button
            onClick={onMarkRead}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              backgroundColor: 'rgba(37,99,235,0.1)', color: '#60a5fa',
              border: '1px solid rgba(37,99,235,0.2)',
            }}
          >
            Mark as read
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messagesLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end',
              }}>
                <div style={{
                  height: 36, width: `${40 + (i * 17) % 30}%`,
                  borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)',
                }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, paddingTop: 32 }}>
            No messages yet
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {sendError && (
          <p style={{ fontSize: 12, color: '#f87171', marginBottom: 6 }}>{sendError}</p>
        )}

        {/* Note toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setIsNote(!isNote)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 5, fontSize: 11.5, cursor: 'pointer',
              fontWeight: isNote ? 600 : 400,
              color: isNote ? '#d97706' : '#6b7280',
              backgroundColor: isNote ? 'rgba(245,158,11,0.1)' : 'transparent',
              border: isNote ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.1s',
            }}
          >
            <Lock style={{ width: 11, height: 11 }} />
            Internal note
          </button>
          <span style={{ fontSize: 11, color: '#4b5563' }}>
            {isNote ? 'Only visible to your team' : 'Sends via Instagram'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={textareaRef}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isNote ? 'Write an internal note…' : 'Type a message… (⌘↵ to send)'}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: isNote ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.04)',
              border: isNote
                ? '1px solid rgba(245,158,11,0.2)'
                : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, resize: 'vertical', minHeight: 64,
              fontSize: 13.5, color: '#f9fafb',
              outline: 'none', fontFamily: 'inherit', lineHeight: 1.45,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              alignSelf: 'flex-end',
              padding: '8px 14px', borderRadius: 8, cursor: text.trim() && !sending ? 'pointer' : 'not-allowed',
              backgroundColor: text.trim() && !sending ? '#2563eb' : 'rgba(37,99,235,0.3)',
              color: '#fff', border: 'none', transition: 'all 0.1s',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            }}
          >
            <Send style={{ width: 14, height: 14 }} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
