'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, UserPlus } from 'lucide-react'
import type { DmConversation, TeamMember, ConversationStatus } from '@/types/dms'
import { STATUS_CONFIG } from './ConversationList'

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProfileSidebarProps {
  conversation: DmConversation | null
  onConversationUpdated: (updated: DmConversation) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfileSidebar({ conversation, onConversationUpdated }: ProfileSidebarProps) {
  const [setters,      setSetters]      = useState<TeamMember[]>([])
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingSetter, setSavingSetter] = useState(false)
  const [hasLead,      setHasLead]      = useState(false)
  const [leadId,       setLeadId]       = useState<string | null>(null)
  const [creatingLead, setCreatingLead] = useState(false)

  // Fetch setters for this creator
  useEffect(() => {
    fetch('/api/team/members?role=setter')
      .then((r) => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setSetters(d as TeamMember[]) })
      .catch(() => {})
  }, [])

  // Check if a lead already exists for this conversation
  useEffect(() => {
    if (!conversation) return
    setHasLead(false)
    setLeadId(null)

    fetch(`/api/crm/leads?dm_conversation_id=${conversation.id}`)
      .then((r) => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d) && d.length > 0) {
          const lead = d[0] as { id: string }
          setHasLead(true)
          setLeadId(lead.id)
        }
      })
      .catch(() => {})
  }, [conversation?.id])

  async function patchConversation(updates: Record<string, unknown>) {
    if (!conversation) return
    const res = await fetch(`/api/dms/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated = await res.json() as DmConversation
      onConversationUpdated(updated)
    }
  }

  async function handleStatusChange(status: ConversationStatus) {
    setSavingStatus(true)
    await patchConversation({ status })
    setSavingStatus(false)
  }

  async function handleSetterChange(setterId: string) {
    setSavingSetter(true)
    await patchConversation({ assigned_setter_id: setterId || null })
    setSavingSetter(false)
  }

  async function handleCreateLead() {
    if (!conversation || creatingLead) return
    setCreatingLead(true)
    // Patching status to 'qualifying' triggers the lead upsert in the API
    await patchConversation({ status: 'qualifying' })
    setCreatingLead(false)
    // Re-check for the new lead
    const res = await fetch(`/api/crm/leads?dm_conversation_id=${conversation.id}`)
    const data = await res.json() as unknown[]
    if (Array.isArray(data) && data.length > 0) {
      const lead = data[0] as { id: string }
      setHasLead(true)
      setLeadId(lead.id)
    }
  }

  if (!conversation) return null

  const username = conversation.ig_username ?? conversation.ig_user_id
  const label    = username.slice(0, 2).toUpperCase()
  const allStatuses = Object.entries(STATUS_CONFIG) as [ConversationStatus, typeof STATUS_CONFIG[ConversationStatus]][]

  return (
    <div style={{
      width: 260, flexShrink: 0,
      backgroundColor: '#0d1117',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      padding: 16, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* Profile header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 4 }}>
        {conversation.ig_profile_pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={conversation.ig_profile_pic}
            alt={label}
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: 'rgba(37,99,235,0.2)', color: '#60a5fa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
          }}>
            {label}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', margin: '0 0 4px' }}>
            @{username}
          </p>
          <a
            href={`https://www.instagram.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11.5, color: '#60a5fa', textDecoration: 'none',
            }}
          >
            View on Instagram
            <ExternalLink style={{ width: 10, height: 10 }} />
          </a>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />

      {/* Status */}
      <div>
        <label style={{
          display: 'block', fontSize: 10, fontWeight: 600, color: '#4b5563',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
        }}>
          Status
        </label>
        <select
          value={conversation.status}
          onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
          disabled={savingStatus}
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f9fafb', outline: 'none', cursor: 'pointer',
            opacity: savingStatus ? 0.5 : 1,
          }}
        >
          {allStatuses.map(([key, cfg]) => (
            <option key={key} value={key} style={{ backgroundColor: '#0d1117' }}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      {/* Assign setter */}
      <div>
        <label style={{
          display: 'block', fontSize: 10, fontWeight: 600, color: '#4b5563',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
        }}>
          Assigned Setter
        </label>
        <select
          value={conversation.assigned_setter_id ?? ''}
          onChange={(e) => handleSetterChange(e.target.value)}
          disabled={savingSetter}
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f9fafb', outline: 'none', cursor: 'pointer',
            opacity: savingSetter ? 0.5 : 1,
          }}
        >
          <option value="" style={{ backgroundColor: '#0d1117' }}>Unassigned</option>
          {setters.map((s) => (
            <option key={s.id} value={s.id} style={{ backgroundColor: '#0d1117' }}>
              {s.full_name ?? s.email ?? s.id}
            </option>
          ))}
        </select>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />

      {/* Lead actions */}
      <div>
        <p style={{
          fontSize: 10, fontWeight: 600, color: '#4b5563',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
        }}>
          CRM Lead
        </p>

        {hasLead && leadId ? (
          <a
            href={`/dashboard/crm?lead=${leadId}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399',
              border: '1px solid rgba(16,185,129,0.2)', textDecoration: 'none',
              cursor: 'pointer', transition: 'all 0.1s',
            }}
          >
            <ExternalLink style={{ width: 13, height: 13 }} />
            View Lead
          </a>
        ) : (
          <button
            onClick={handleCreateLead}
            disabled={creatingLead}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              backgroundColor: creatingLead ? 'rgba(37,99,235,0.1)' : 'rgba(37,99,235,0.15)',
              color: '#60a5fa', border: '1px solid rgba(37,99,235,0.25)',
              cursor: creatingLead ? 'not-allowed' : 'pointer', transition: 'all 0.1s',
            }}
          >
            <UserPlus style={{ width: 13, height: 13 }} />
            {creatingLead ? 'Creating…' : 'Create Lead'}
          </button>
        )}
      </div>
    </div>
  )
}
