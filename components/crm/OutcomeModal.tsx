'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, PhoneMissed, Loader2, ChevronLeft, X } from 'lucide-react'
import type { Lead } from '@/types/crm'

// ── Types ──────────────────────────────────────────────────────────────────

type Step =
  | 'pick_outcome'
  | 'pick_result'
  | 'form_won'
  | 'form_lost'
  | 'confirm_no_show'
  | 'submitting'
  | 'success'
  | 'error'

interface Product {
  id: string
  name: string
  tier: 'ht' | 'mt' | 'lt'
  payment_type: string
  price: number
}

const LOST_REASONS = [
  { value: 'price_objection', label: 'Price objection' },
  { value: 'not_a_fit',       label: 'Not a fit' },
  { value: 'needs_time',      label: 'Needs more time' },
  { value: 'ghosted',         label: 'Ghosted / no decision' },
  { value: 'other',           label: 'Other' },
]

const PAYMENT_TYPES = [
  { value: 'upfront',    label: 'Paid in full (upfront)' },
  { value: 'instalment', label: 'First instalment' },
  { value: 'recurring',  label: 'Recurring subscription' },
]

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  lead: Lead
  open: boolean
  onClose: () => void
  onSuccess: (leadId: string, outcome: 'showed_won' | 'showed_lost' | 'no_show') => void
}

export function OutcomeModal({ lead, open, onClose, onSuccess }: Props) {
  const [step, setStep]             = useState<Step>('pick_outcome')
  const [products, setProducts]     = useState<Product[]>([])
  const [notes, setNotes]           = useState('')
  const [lostReason, setLostReason] = useState('')
  const [productId, setProductId]   = useState('')
  const [productName, setProductName] = useState('')
  const [amount, setAmount]         = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [errorMsg, setErrorMsg]     = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('pick_outcome')
      setNotes('')
      setLostReason('')
      setProductId('')
      setProductName('')
      setAmount('')
      setPaymentType('')
      setErrorMsg('')
    }
  }, [open])

  // Fetch products once when form_won step reached
  useEffect(() => {
    if (step === 'form_won' && products.length === 0) {
      fetch('/api/products')
        .then(r => r.json())
        .then((data: unknown) => setProducts(Array.isArray(data) ? (data as Product[]) : []))
        .catch(() => setProducts([]))
    }
  }, [step, products.length])

  function handleProductChange(id: string) {
    setProductId(id)
    const p = products.find(x => x.id === id)
    if (p) {
      setProductName(p.name)
      setAmount(String(p.price))
      setPaymentType(
        p.payment_type === 'onetime' ? 'upfront' :
        p.payment_type === 'recurring' ? 'recurring' : ''
      )
    }
  }

  async function submit(outcome: 'showed_won' | 'showed_lost' | 'no_show') {
    setStep('submitting')
    setErrorMsg('')

    const body: Record<string, unknown> = { outcome }
    if (outcome === 'no_show') {
      if (notes) body.notes = notes
    } else if (outcome === 'showed_lost') {
      body.reason = lostReason
      if (notes) body.notes = notes
    } else {
      body.amount       = parseFloat(amount)
      body.payment_type = paymentType
      if (productId)   body.product_id   = productId
      if (productName) body.product_name = productName
      if (notes)       body.notes        = notes
    }

    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Something went wrong')
      }
      setStep('success')
      setTimeout(() => { onSuccess(lead.id, outcome); onClose() }, 1200)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error')
      setStep('error')
    }
  }

  if (!open) return null

  const canSubmitWon  = amount !== '' && parseFloat(amount) > 0 && paymentType !== ''
  const canSubmitLost = lostReason !== ''

  return (
    /* Overlay */
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* Panel */}
      <div className="w-full max-w-md rounded-2xl bg-[#0d1117] border border-white/10 shadow-2xl overflow-hidden">

        {/* ── Pick outcome ───────────────────────────────────────────────── */}
        {step === 'pick_outcome' && (
          <>
            <ModalHeader title={lead.name} subtitle="Did they show up?" onClose={onClose} />
            <div className="px-5 pb-5 pt-3 flex gap-3">
              <OutcomeButton
                icon={<CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                label="Showed Up"
                hoverClass="hover:bg-emerald-500/10 hover:border-emerald-500/30"
                onClick={() => setStep('pick_result')}
              />
              <OutcomeButton
                icon={<PhoneMissed className="w-6 h-6 text-red-400" />}
                label="No Show"
                hoverClass="hover:bg-red-500/10 hover:border-red-500/30"
                onClick={() => setStep('confirm_no_show')}
              />
            </div>
          </>
        )}

        {/* ── Pick result ────────────────────────────────────────────────── */}
        {step === 'pick_result' && (
          <>
            <ModalHeader
              title={`${lead.name} — Showed`}
              subtitle="What was the outcome?"
              onClose={onClose}
              onBack={() => setStep('pick_outcome')}
            />
            <div className="px-5 pb-5 pt-3 flex gap-3">
              <OutcomeButton
                icon={<CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                label="Closed"
                hoverClass="hover:bg-emerald-500/10 hover:border-emerald-500/30"
                onClick={() => setStep('form_won')}
              />
              <OutcomeButton
                icon={<XCircle className="w-6 h-6 text-amber-400" />}
                label="Lost"
                hoverClass="hover:bg-amber-500/10 hover:border-amber-500/30"
                onClick={() => setStep('form_lost')}
              />
            </div>
          </>
        )}

        {/* ── Form: Won ──────────────────────────────────────────────────── */}
        {step === 'form_won' && (
          <>
            <ModalHeader
              title="Closed Won 🎉"
              titleClass="text-emerald-400"
              onClose={onClose}
              onBack={() => setStep('pick_result')}
            />
            <div className="px-5 pb-5 pt-2 space-y-4">
              {products.length > 0 && (
                <Field label="Product">
                  <select
                    value={productId}
                    onChange={e => handleProductChange(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select product…</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.tier.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount collected ($)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Payment type">
                  <select
                    value={paymentType}
                    onChange={e => setPaymentType(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select…</option>
                    {PAYMENT_TYPES.map(pt => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Notes (optional)">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any notes about the close…"
                  rows={2}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#4b5563] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </Field>

              <Button
                disabled={!canSubmitWon}
                onClick={() => submit('showed_won')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
              >
                Record Win
              </Button>
            </div>
          </>
        )}

        {/* ── Form: Lost ─────────────────────────────────────────────────── */}
        {step === 'form_lost' && (
          <>
            <ModalHeader
              title="Closed Lost"
              titleClass="text-amber-400"
              onClose={onClose}
              onBack={() => setStep('pick_result')}
            />
            <div className="px-5 pb-5 pt-2 space-y-4">
              <Field label="Reason">
                <select
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select reason…</option>
                  {LOST_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="What came up on the call?"
                  rows={3}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#4b5563] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </Field>

              <Button
                disabled={!canSubmitLost}
                onClick={() => submit('showed_lost')}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
              >
                Record Loss
              </Button>
            </div>
          </>
        )}

        {/* ── Confirm No Show ────────────────────────────────────────────── */}
        {step === 'confirm_no_show' && (
          <>
            <ModalHeader
              title="No Show"
              titleClass="text-red-400"
              subtitle={`Mark ${lead.name} as no-show?`}
              onClose={onClose}
              onBack={() => setStep('pick_outcome')}
            />
            <div className="px-5 pb-5 pt-2 space-y-4">
              <Field label="Notes (optional)">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any context to add?"
                  rows={2}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#4b5563] resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </Field>
              <Button
                onClick={() => submit('no_show')}
                className="w-full bg-red-700 hover:bg-red-600 text-white"
              >
                Confirm No Show
              </Button>
            </div>
          </>
        )}

        {/* ── Submitting ─────────────────────────────────────────────────── */}
        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-[#9ca3af]">Saving outcome…</p>
          </div>
        )}

        {/* ── Success ────────────────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-400">Outcome recorded</p>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {step === 'error' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 gap-4">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-center text-[#9ca3af]">{errorMsg}</p>
            <Button
              variant="outline"
              onClick={() => setStep('pick_outcome')}
              className="border-white/10 text-[#f9fafb] hover:bg-white/5"
            >
              Try again
            </Button>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ModalHeader({
  title,
  titleClass = 'text-[#f9fafb]',
  subtitle,
  onClose,
  onBack,
}: {
  title: string
  titleClass?: string
  subtitle?: string
  onClose: () => void
  onBack?: () => void
}) {
  return (
    <div className="flex items-start justify-between px-5 pt-5 pb-0">
      <div>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-[#9ca3af] hover:text-white mb-1.5 transition-colors"
          >
            <ChevronLeft className="w-3 h-3" /> Back
          </button>
        )}
        <h2 className={`text-base font-semibold ${titleClass}`}>{title}</h2>
        {subtitle && <p className="text-sm text-[#9ca3af] mt-0.5">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="text-[#4b5563] hover:text-[#9ca3af] transition-colors mt-0.5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function OutcomeButton({
  icon,
  label,
  hoverClass,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hoverClass: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-2.5 py-5 rounded-xl border border-white/10 bg-white/[0.03] transition-colors group ${hoverClass}`}
    >
      <span className="group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-medium text-[#f9fafb]">{label}</span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-[#9ca3af]">{label}</label>
      {children}
    </div>
  )
}
