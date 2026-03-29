'use client'

import { useState, useEffect, useCallback } from 'react'
import { OutcomeModal } from '@/components/crm/OutcomeModal'
import { Phone, Calendar, Clock, User, ChevronRight, CheckCircle2, PhoneMissed, XCircle } from 'lucide-react'
import type { Lead } from '@/types/crm'

function formatDate(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeUntil(iso: string | null | undefined) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  const mins = Math.round(diff / 60000)
  if (Math.abs(mins) < 60) return `${Math.abs(mins)}m ${diff < 0 ? 'ago' : 'away'}`
  const hrs = Math.round(diff / 3600000)
  if (Math.abs(hrs) < 24) return `${Math.abs(hrs)}h ${diff < 0 ? 'ago' : 'away'}`
  const days = Math.round(diff / 86400000)
  return `${Math.abs(days)}d ${diff < 0 ? 'ago' : 'away'}`
}

// Summarise the most important tally answers for the card preview
function tallyPreview(answers: Record<string, unknown> | null): string | null {
  if (!answers) return null
  const keys = Object.keys(answers)
  if (keys.length === 0) return null
  // Show first 2 key=value pairs, truncated
  return keys
    .slice(0, 2)
    .map(k => `${k.replace(/_/g, ' ')}: ${String(answers[k]).slice(0, 40)}`)
    .join(' · ')
}

type OutcomeTag = 'showed_won' | 'showed_lost' | 'no_show'

const OUTCOME_CONFIG: Record<OutcomeTag, { label: string; color: string; icon: React.ElementType }> = {
  showed_won:  { label: 'Closed Won',  color: 'text-emerald-400', icon: CheckCircle2 },
  showed_lost: { label: 'Closed Lost', color: 'text-amber-400',   icon: XCircle },
  no_show:     { label: 'No Show',     color: 'text-red-400',     icon: PhoneMissed },
}

export function CallsList() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  // Tracks optimistic outcomes for leads marked in this session
  const [markedOutcomes, setMarkedOutcomes] = useState<Record<string, OutcomeTag>>({})

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/leads?stage=call_booked')
      if (res.ok) {
        const data: Lead[] = await res.json()
        setLeads(Array.isArray(data) ? data : [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  function handleSuccess(leadId: string, outcome: OutcomeTag) {
    setMarkedOutcomes(prev => ({ ...prev, [leadId]: outcome }))
    setSelectedLead(null)
  }

  const pendingLeads = leads.filter(l => !markedOutcomes[l.id])
  const doneLeads    = leads.filter(l =>  markedOutcomes[l.id])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <Phone className="w-10 h-10 text-[#4b5563]" />
        <p className="text-[#9ca3af] font-medium">No calls booked</p>
        <p className="text-sm text-[#4b5563]">
          Leads moved to &quot;Call Booked&quot; will appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Pending calls */}
      {pendingLeads.length > 0 && (
        <div className="space-y-3">
          {pendingLeads.map(lead => (
            <CallCard
              key={lead.id}
              lead={lead}
              onMark={() => setSelectedLead(lead)}
            />
          ))}
        </div>
      )}

      {/* Already marked this session */}
      {doneLeads.length > 0 && (
        <div className="mt-8">
          <p className="text-xs text-[#4b5563] uppercase tracking-wide font-medium mb-3">
            Marked this session
          </p>
          <div className="space-y-2">
            {doneLeads.map(lead => {
              const outcome = markedOutcomes[lead.id]
              const cfg = OUTCOME_CONFIG[outcome]
              const Icon = cfg.icon
              return (
                <div
                  key={lead.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <span className="text-sm text-[#9ca3af]">{lead.name}</span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selectedLead && (
        <OutcomeModal
          lead={selectedLead}
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  )
}

// ── CallCard ───────────────────────────────────────────────────────────────

interface CardProps {
  lead: Lead
  onMark: () => void
}

function CallCard({ lead, onMark }: CardProps) {
  const bookedAt = (lead as Lead & { booked_at?: string }).booked_at
  const tallyAnswers = (lead as Lead & { tally_answers?: Record<string, unknown> }).tally_answers
  const preview = tallyPreview(tallyAnswers ?? null)
  const until   = timeUntil(bookedAt)

  return (
    <div className="group rounded-xl border border-white/[0.08] bg-[#0d1117] hover:border-white/20 transition-colors">
      <div className="flex items-start gap-4 p-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-blue-400" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[#f9fafb]">{lead.name}</span>
            {lead.ig_handle && (
              <span className="text-xs text-[#4b5563]">@{lead.ig_handle}</span>
            )}
            {lead.offer_tier && (
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                lead.offer_tier === 'ht'
                  ? 'bg-blue-500/20 text-blue-300'
                  : lead.offer_tier === 'mt'
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-slate-500/20 text-slate-300'
              }`}>
                {lead.offer_tier}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {bookedAt && (
              <span className="flex items-center gap-1 text-xs text-[#9ca3af]">
                <Calendar className="w-3 h-3" />
                {formatDate(bookedAt)}
              </span>
            )}
            {until && (
              <span className="flex items-center gap-1 text-xs text-[#4b5563]">
                <Clock className="w-3 h-3" />
                {until}
              </span>
            )}
          </div>

          {preview && (
            <p className="mt-1.5 text-xs text-[#4b5563] truncate">{preview}</p>
          )}

          {(lead.email || lead.phone) && (
            <p className="mt-1 text-xs text-[#4b5563]">
              {[lead.email, lead.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onMark}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
        >
          Mark Outcome
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
