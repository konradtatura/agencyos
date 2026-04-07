'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { DmConversation, DmMessage, ConversationStatus } from '@/types/dms'
import ConversationList from './ConversationList'
import MessageThread from './MessageThread'
import ProfileSidebar from './ProfileSidebar'

// ── Realtime helpers ──────────────────────────────────────────────────────────

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DMInbox() {
  const [conversations,     setConversations]     = useState<DmConversation[]>([])
  const [convsLoading,      setConvsLoading]      = useState(true)
  const [selectedConv,      setSelectedConv]      = useState<DmConversation | null>(null)
  const [messages,          setMessages]          = useState<DmMessage[]>([])
  const [messagesLoading,   setMessagesLoading]   = useState(false)
  const [activeFilter,      setActiveFilter]      = useState('all')
  const [search,            setSearch]            = useState('')
  const [messagesRefreshKey, setMessagesRefreshKey] = useState(0)

  const selectedConvRef = useRef<DmConversation | null>(null)
  selectedConvRef.current = selectedConv

  // ── Fetch conversations ────────────────────────────────────────────────────

  const fetchConversations = useCallback(async (filter = activeFilter, q = search) => {
    const params = new URLSearchParams()
    if (q) params.set('search', q)
    if (filter === 'unread') {
      params.set('unread_only', 'true')
    } else if (filter !== 'all') {
      params.set('status', filter as ConversationStatus)
    }

    try {
      const res = await fetch(`/api/dms?${params}`)
      if (!res.ok) return
      const data = await res.json() as DmConversation[]
      setConversations(data)

      // Keep selectedConv in sync with fresh data
      if (selectedConvRef.current) {
        const refreshed = data.find((c) => c.id === selectedConvRef.current!.id)
        if (refreshed) setSelectedConv(refreshed)
      }
    } catch { /* ignore */ }
    finally { setConvsLoading(false) }
  }, [activeFilter, search])

  useEffect(() => {
    setConvsLoading(true)
    fetchConversations(activeFilter, search)
  }, [activeFilter, search, fetchConversations])

  // ── Fetch messages for selected conversation ───────────────────────────────

  useEffect(() => {
    if (!selectedConv) {
      setMessages([])
      return
    }
    setMessagesLoading(true)
    fetch(`/api/dms/${selectedConv.id}/messages`)
      .then((r) => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setMessages(d as DmMessage[]) })
      .catch(() => {})
      .finally(() => setMessagesLoading(false))
  }, [selectedConv?.id, messagesRefreshKey])

  // ── Realtime subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()

    const convChannel = supabase
      .channel('dm_conversations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dm_conversations' },
        (payload: RealtimePayload) => {
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as DmConversation
            setConversations((prev) => [newConv, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as DmConversation
            setConversations((prev) =>
              prev.map((c) => c.id === updated.id ? updated : c)
            )
            // Keep selected conv fresh
            if (selectedConvRef.current?.id === updated.id) {
              setSelectedConv(updated)
            }
          }
        },
      )
      .subscribe()

    const msgChannel = supabase
      .channel('dm_messages_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        (payload: RealtimePayload) => {
          const newMsg = payload.new as DmMessage
          // Append to thread if the conversation is currently open
          if (selectedConvRef.current?.id === newMsg.conversation_id) {
            setMessages((prev) => [...prev, newMsg])
          }
          // Refresh conversation list to update unread + last_message_at
          fetchConversations(activeFilter, search)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(msgChannel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, search])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSelectConversation(conv: DmConversation) {
    setSelectedConv(conv)
    setMessages([])
    setMessagesRefreshKey(0)
  }

  async function handleMarkRead() {
    if (!selectedConv || selectedConv.unread_count === 0) return
    await fetch(`/api/dms/${selectedConv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unread_count: 0 }),
    })
    const updated = { ...selectedConv, unread_count: 0 }
    setSelectedConv(updated)
    setConversations((prev) => prev.map((c) => c.id === updated.id ? updated : c))
  }

  function handleMessageSent() {
    setMessagesRefreshKey((k) => k + 1)
  }

  function handleConversationUpdated(updated: DmConversation) {
    setSelectedConv(updated)
    setConversations((prev) => prev.map((c) => c.id === updated.id ? updated : c))
  }

  // ── No conversations at all — show setup instructions ─────────────────────
  if (!convsLoading && conversations.length === 0 && activeFilter === 'all' && !search) {
    return <EmptySetup onRefresh={() => fetchConversations()} />
  }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 64px)',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <ConversationList
        conversations={conversations}
        loading={convsLoading}
        selectedId={selectedConv?.id ?? null}
        activeFilter={activeFilter}
        search={search}
        onFilterChange={setActiveFilter}
        onSearchChange={setSearch}
        onSelect={handleSelectConversation}
      />
      <MessageThread
        conversation={selectedConv}
        messages={messages}
        messagesLoading={messagesLoading}
        onMessageSent={handleMessageSent}
        onMarkRead={handleMarkRead}
      />
      <ProfileSidebar
        conversation={selectedConv}
        onConversationUpdated={handleConversationUpdated}
      />
    </div>
  )
}

// ── Empty setup state ─────────────────────────────────────────────────────────

function EmptySetup({ onRefresh }: { onRefresh: () => void }) {
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhooks/instagram-dm`
      : '/api/webhooks/instagram-dm'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 'calc(100vh - 64px)',
    }}>
      <div style={{
        maxWidth: 480, padding: 32, borderRadius: 16, textAlign: 'center',
        backgroundColor: '#0d1117',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
          backgroundColor: 'rgba(37,99,235,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Globe style={{ width: 22, height: 22, color: '#2563eb' }} />
        </div>

        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f9fafb', margin: '0 0 8px' }}>
          Connect Instagram DMs
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.55 }}>
          No conversations yet. Register this webhook URL in your Meta App Dashboard
          under <strong style={{ color: '#9ca3af' }}>Webhooks → Instagram → messages</strong>.
        </p>

        <div style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '10px 14px',
          marginBottom: 20, textAlign: 'left',
        }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Callback URL
          </p>
          <code style={{ fontSize: 12, color: '#60a5fa', wordBreak: 'break-all' }}>
            {webhookUrl}
          </code>
        </div>

        <div style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '10px 14px',
          marginBottom: 24, textAlign: 'left',
        }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Verify Token
          </p>
          <code style={{ fontSize: 12, color: '#34d399' }}>
            INSTAGRAM_WEBHOOK_VERIFY_TOKEN (from .env.local)
          </code>
        </div>

        <button
          onClick={onRefresh}
          style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            backgroundColor: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
