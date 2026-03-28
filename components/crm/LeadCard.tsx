'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Calendar, AlertTriangle } from 'lucide-react'
import type { Lead } from '@/types/crm'
import DisqualifyModal from './DisqualifyModal'

interface LeadCardProps {
  lead: Lead
  isDragging?: boolean
  onDisqualified?: () => void
}

const TIER_CONFIG = {
  ht: { label: 'HT', bg: 'rgba(37,99,235,0.18)', color: '#60a5fa', border: 'rgba(37,99,235,0.35)' },
  mt: { label: 'MT', bg: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: 'rgba(245,158,11,0.35)' },
  lt: { label: 'LT', bg: 'rgba(16,185,129,0.18)', color: '#34d399', border: 'rgba(16,185,129,0.35)' },
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function getDaysSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000))
}

function getFollowUpStatus(dateStr: string | null) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((date.getTime() - midnight.getTime()) / 86_400_000)
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (diffDays < 0) return { label, color: '#ef4444', overdue: true }
  if (diffDays <= 2) return { label, color: '#f59e0b', overdue: false }
  return { label, color: '#4b5563', overdue: false }
}

export default function LeadCard({ lead, isDragging, onDisqualified }: LeadCardProps) {
  const router = useRouter()
  const [disqualifyOpen, setDisqualifyOpen] = useState(false)

  const tier = lead.offer_tier ? TIER_CONFIG[lead.offer_tier] : null
  const days = getDaysSince(lead.updated_at)
  const followUp = getFollowUpStatus(lead.follow_up_date)

  return (
    <>
      <div
        className="group"
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/dashboard/crm/${lead.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && router.push(`/dashboard/crm/${lead.id}`)}
        style={{
          backgroundColor: isDragging ? '#111827' : '#0d1117',
          border: `1px solid ${isDragging ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 10,
          padding: '10px 11px',
          cursor: 'pointer',
          userSelect: 'none',
          boxShadow: isDragging
            ? '0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(37,99,235,0.2)'
            : '0 1px 3px rgba(0,0,0,0.3)',
          transition: 'border-color 0.12s, box-shadow 0.12s',
          outline: 'none',
        }}
      >
        {/* Row 1: Avatar + name + tier */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
          <div
            aria-hidden
            style={{
              flexShrink: 0,
              width: 26, height: 26, borderRadius: '50%',
              backgroundColor: '#1a2742',
              border: '1px solid rgba(37,99,235,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#7aa2f7',
              letterSpacing: '0.03em',
            }}
          >
            {getInitials(lead.name)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 12, fontWeight: 600, color: '#e5e7eb',
                lineHeight: 1.25,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {lead.name}
            </p>
            {lead.ig_handle && (
              <p
                style={{
                  fontSize: 10.5, color: '#4b5563', marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                @{lead.ig_handle}
              </p>
            )}
          </div>

          {tier && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                padding: '2px 5px', borderRadius: 4,
                backgroundColor: tier.bg, color: tier.color,
                border: `1px solid ${tier.border}`,
              }}
            >
              {tier.label}
            </span>
          )}
        </div>

        {/* Row 2: meta chips */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, color: '#374151',
            }}
          >
            <Clock size={9} strokeWidth={2.5} />
            {days === 0 ? 'Today' : `${days}d`}
          </span>

          {followUp && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, color: followUp.color,
                padding: '1px 5px', borderRadius: 4,
                backgroundColor: `${followUp.color}15`,
                border: `1px solid ${followUp.color}30`,
              }}
            >
              {followUp.overdue ? <AlertTriangle size={8} strokeWidth={2.5} /> : <Calendar size={8} strokeWidth={2.5} />}
              {followUp.label}
            </span>
          )}
        </div>

        {/* Row 3: assigned avatars + disqualify */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {lead.assigned_setter_id && (
              <div
                title="Setter"
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  backgroundColor: '#1e293b',
                  border: '1.5px solid #0d1117',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#64748b',
                  marginRight: lead.assigned_closer_id ? -4 : 0,
                  zIndex: 1, position: 'relative',
                }}
              >
                S
              </div>
            )}
            {lead.assigned_closer_id && (
              <div
                title="Closer"
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  backgroundColor: '#162032',
                  border: '1.5px solid #0d1117',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#2563eb',
                  position: 'relative',
                }}
              >
                C
              </div>
            )}
          </div>

          {/* Disqualify — visible only on hover via CSS group */}
          <button
            className="opacity-0 group-hover:opacity-100"
            style={{
              fontSize: 10, fontWeight: 500,
              color: '#ef4444',
              padding: '2px 7px', borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.25)',
              backgroundColor: 'rgba(239,68,68,0.07)',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onClick={(e) => {
              e.stopPropagation()
              setDisqualifyOpen(true)
            }}
          >
            Disqualify
          </button>
        </div>
      </div>

      <DisqualifyModal
        leadId={lead.id}
        leadName={lead.name}
        isOpen={disqualifyOpen}
        onClose={() => setDisqualifyOpen(false)}
        onComplete={() => {
          setDisqualifyOpen(false)
          onDisqualified?.()
        }}
      />
    </>
  )
}
