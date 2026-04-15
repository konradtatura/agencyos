'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

interface PostCallNoteModalProps {
  leadId: string
  onClose: () => void
  onSaved: () => void
}

const INPUT = 'w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none focus:ring-1 focus:ring-[#2563eb] transition-colors placeholder:text-[#4b5563]'
const INPUT_STYLE = { backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
const LABEL = 'mb-1.5 block text-[12px] font-medium text-[#9ca3af]'

export default function PostCallNoteModal({ leadId, onClose, onSaved }: PostCallNoteModalProps) {
  const today = new Date().toISOString().slice(0, 10)

  const [callDate,             setCallDate]             = useState(today)
  const [apptSource,           setApptSource]           = useState('')
  const [callOutcome,          setCallOutcome]          = useState('')
  const [offerPitched,         setOfferPitched]         = useState('')
  const [paymentPlatform,      setPaymentPlatform]      = useState('')
  const [instalment_count,     setInstalmentCount]      = useState('')
  const [cashUpfront,          setCashUpfront]          = useState('')
  const [amountOwed,           setAmountOwed]           = useState('')
  const [payoffDate,           setPayoffDate]           = useState('')
  const [setterNote,           setSetterNote]           = useState('')
  const [prospectNotes,        setProspectNotes]        = useState('')
  const [crmUpdated,           setCrmUpdated]           = useState(false)
  const [programStatus,        setProgramStatus]        = useState('active')
  const [saving,               setSaving]               = useState(false)
  const [error,                setError]                = useState<string | null>(null)

  const isClosed = callOutcome === 'closed'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/revenue/post-call-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id:                  leadId,
          call_date:                callDate || null,
          appointment_source:       apptSource    || null,
          call_outcome:             callOutcome   || null,
          offer_pitched:            offerPitched  || null,
          initial_payment_platform: isClosed ? (paymentPlatform || null) : null,
          instalment_count:         isClosed && instalment_count ? Number(instalment_count) : null,
          cash_collected_upfront:   isClosed && cashUpfront  ? Number(cashUpfront)  : null,
          amount_owed:              isClosed && amountOwed   ? Number(amountOwed)   : null,
          expected_payoff_date:     isClosed ? (payoffDate || null) : null,
          prospect_notes:           prospectNotes || null,
          crm_updated:              crmUpdated,
          program_status:           isClosed ? (programStatus || 'active') : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Save failed'); return }
      onSaved()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl my-4"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="text-[15px] font-semibold text-[#f9fafb]">Post-Call Note</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/[0.06]">
            <X className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Call date */}
          <div>
            <label className={LABEL}>Call Date</label>
            <input type="date" value={callDate} onChange={e => setCallDate(e.target.value)}
              className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
          </div>

          {/* Appointment source */}
          <div>
            <label className={LABEL}>Appointment Source</label>
            <select value={apptSource} onChange={e => setApptSource(e.target.value)}
              className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }}>
              <option value="">Select source…</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
              <option value="organic">Organic</option>
              <option value="ads">Ads</option>
              <option value="referral">Referral</option>
            </select>
          </div>

          {/* Call outcome */}
          <div>
            <label className={LABEL}>Call Outcome <span className="text-[#ef4444]">*</span></label>
            <select required value={callOutcome} onChange={e => setCallOutcome(e.target.value)}
              className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }}>
              <option value="">Select outcome…</option>
              <option value="closed">Closed</option>
              <option value="no_show">No Show</option>
              <option value="follow_up">Follow-Up</option>
              <option value="disqualified">Disqualified</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </div>

          {/* Offer pitched — always shown */}
          <div>
            <label className={LABEL}>Offer Pitched</label>
            <input type="text" value={offerPitched} onChange={e => setOfferPitched(e.target.value)}
              placeholder="e.g. HT 12-week program"
              className={INPUT} style={INPUT_STYLE} />
          </div>

          {/* Closed-only fields */}
          {isClosed && (
            <>
              <div className="rounded-xl p-4 space-y-4"
                style={{ backgroundColor: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#10b981]">Sale Details</p>

                <div>
                  <label className={LABEL}>Payment Platform</label>
                  <select value={paymentPlatform} onChange={e => setPaymentPlatform(e.target.value)}
                    className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }}>
                    <option value="">Select…</option>
                    <option value="stripe">Stripe</option>
                    <option value="whop">Whop</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Cash Collected Upfront ($)</label>
                    <input type="number" step="0.01" min="0" value={cashUpfront}
                      onChange={e => setCashUpfront(e.target.value)}
                      placeholder="0.00"
                      className={INPUT} style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className={LABEL}># Instalments</label>
                    <input type="number" min="1" value={instalment_count}
                      onChange={e => setInstalmentCount(e.target.value)}
                      placeholder="1"
                      className={INPUT} style={INPUT_STYLE} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Amount Still Owed ($)</label>
                    <input type="number" step="0.01" min="0" value={amountOwed}
                      onChange={e => setAmountOwed(e.target.value)}
                      placeholder="0.00"
                      className={INPUT} style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className={LABEL}>Expected Payoff Date</label>
                    <input type="date" value={payoffDate} onChange={e => setPayoffDate(e.target.value)}
                      className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Program Status</label>
                  <select value={programStatus} onChange={e => setProgramStatus(e.target.value)}
                    className={INPUT} style={{ ...INPUT_STYLE, colorScheme: 'dark' }}>
                    <option value="active">Active</option>
                    <option value="finished">Finished</option>
                    <option value="discontinued">Discontinued</option>
                    <option value="refund_requested">Refund Requested</option>
                    <option value="refund_issued">Refund Issued</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Setter note */}
          <div>
            <label className={LABEL}>Setter (name / note)</label>
            <input type="text" value={setterNote} onChange={e => setSetterNote(e.target.value)}
              placeholder="Who set this call?"
              className={INPUT} style={INPUT_STYLE} />
          </div>

          {/* Prospect notes */}
          <div>
            <label className={LABEL}>Prospect Notes</label>
            <textarea value={prospectNotes} onChange={e => setProspectNotes(e.target.value)}
              rows={3} placeholder="Key objections, context, follow-up notes…"
              className={`${INPUT} resize-none`} style={INPUT_STYLE} />
          </div>

          {/* CRM updated toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setCrmUpdated(v => !v)}
              className="relative h-5 w-9 rounded-full transition-colors cursor-pointer"
              style={{ backgroundColor: crmUpdated ? '#2563eb' : 'rgba(255,255,255,0.1)' }}
            >
              <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: crmUpdated ? 'translateX(16px)' : 'translateX(2px)' }} />
            </div>
            <span className="text-[13px] text-[#d1d5db]">CRM Updated?</span>
          </label>

          {error && (
            <p className="rounded-lg px-3 py-2.5 text-[12px] text-[#f87171]"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-medium text-[#9ca3af] hover:text-[#f9fafb] transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#2563eb' }}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
