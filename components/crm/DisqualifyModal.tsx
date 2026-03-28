'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, TrendingDown, Skull, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type DowngradeOffer = 'mt' | 'lt' | null
type Step = 'choice' | 'loading' | 'success' | 'error'

interface DisqualifyModalProps {
  leadId: string
  leadName: string
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

interface Choice {
  value: DowngradeOffer
  label: string
  sublabel: string
  accentColor: string
  bgColor: string
  borderColor: string
  icon: React.ReactNode
}

const CHOICES: Choice[] = [
  {
    value: 'mt',
    label: 'Yes — Mid Ticket',
    sublabel: 'Route to MT downgrade pipeline as Offered',
    accentColor: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.07)',
    borderColor: 'rgba(245,158,11,0.25)',
    icon: <TrendingDown size={15} color="#f59e0b" />,
  },
  {
    value: 'lt',
    label: 'Yes — Low Ticket',
    sublabel: 'Route to LT downgrade pipeline as Offered',
    accentColor: '#10b981',
    bgColor: 'rgba(16,185,129,0.07)',
    borderColor: 'rgba(16,185,129,0.25)',
    icon: <TrendingDown size={15} color="#10b981" />,
  },
  {
    value: null,
    label: 'No — Mark as Dead',
    sublabel: 'Remove from all pipelines permanently',
    accentColor: '#ef4444',
    bgColor: 'rgba(239,68,68,0.07)',
    borderColor: 'rgba(239,68,68,0.25)',
    icon: <Skull size={15} color="#ef4444" />,
  },
]

export default function DisqualifyModal({
  leadId,
  leadName,
  isOpen,
  onClose,
  onComplete,
}: DisqualifyModalProps) {
  const [step, setStep] = useState<Step>('choice')
  const [chosenOffer, setChosenOffer] = useState<DowngradeOffer | undefined>(undefined)
  const [errorMsg, setErrorMsg] = useState('')

  // Reset to choice step whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('choice')
      setChosenOffer(undefined)
      setErrorMsg('')
    }
  }, [isOpen])

  // Auto-call onComplete 1.5s after success
  useEffect(() => {
    if (step !== 'success') return
    const timer = setTimeout(() => onComplete(), 1500)
    return () => clearTimeout(timer)
  }, [step, onComplete])

  async function handleChoice(offer: DowngradeOffer) {
    setChosenOffer(offer)
    setStep('loading')
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/disqualify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downgrade_offer: offer }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Request failed')
      }
      setStep('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStep('error')
    }
  }

  function handleRetry() {
    if (chosenOffer !== undefined) {
      handleChoice(chosenOffer)
    }
  }

  // Only allow the modal to close in the 'choice' step (via the X button)
  function handleOpenChange(open: boolean) {
    if (!open && step === 'choice') onClose()
    // Do nothing for other steps — modal stays open
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(5px)',
            zIndex: 50,
          }}
        />
        <Dialog.Content
          // Prevent any click-outside from closing the modal
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            // Allow escape only from choice step
            if (step !== 'choice') e.preventDefault()
          }}
          style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 51,
            width: 420,
            backgroundColor: '#0d1117',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 16,
            padding: 24,
            outline: 'none',
          }}
        >
          {/* ── Step 1: Choice ─────────────────────────────────────────── */}
          {step === 'choice' && (
            <>
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', marginBottom: 6,
                }}
              >
                <div>
                  <Dialog.Title
                    style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb' }}
                  >
                    Disqualify {leadName}?
                  </Dialog.Title>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: 'transparent',
                    color: '#6b7280', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 20 }}>
                Is this person a fit for a lower-tier offer?
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CHOICES.map((c) => {
                  const key = c.value ?? 'dead'
                  return (
                    <button
                      key={key}
                      onClick={() => handleChoice(c.value)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 10, width: '100%',
                        border: `1px solid ${c.borderColor}`,
                        backgroundColor: c.bgColor,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'filter 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)' }}
                    >
                      <div
                        style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${c.borderColor}`,
                        }}
                      >
                        {c.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: c.accentColor }}>
                          {c.label}
                        </p>
                        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                          {c.sublabel}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Step 2: Loading ─────────────────────────────────────────── */}
          {step === 'loading' && (
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '32px 0', gap: 14,
              }}
            >
              <Loader2
                size={32}
                color="#2563eb"
                style={{ animation: 'spin 0.8s linear infinite' }}
              />
              <p style={{ fontSize: 13, color: '#9ca3af' }}>
                {chosenOffer
                  ? `Moving to ${chosenOffer.toUpperCase()} downgrade pipeline…`
                  : 'Marking lead as dead…'}
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── Step 3a: Success ────────────────────────────────────────── */}
          {step === 'success' && (
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '32px 0', gap: 12,
              }}
            >
              <CheckCircle size={36} color="#10b981" />
              {chosenOffer ? (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', textAlign: 'center' }}>
                    Moved to Downgrade Pipeline as{' '}
                    <span style={{ color: chosenOffer === 'mt' ? '#fbbf24' : '#34d399' }}>
                      {chosenOffer.toUpperCase()}
                    </span>
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                    Lead is now in the <strong style={{ color: '#9ca3af' }}>Offered</strong> column
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>
                    Lead marked as Dead
                  </p>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    Removed from all pipelines
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Step 3b: Error ──────────────────────────────────────────── */}
          {step === 'error' && (
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '28px 0', gap: 12,
              }}
            >
              <AlertCircle size={32} color="#ef4444" />
              <p style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb' }}>
                Something went wrong
              </p>
              <p
                style={{
                  fontSize: 11.5, color: '#6b7280', textAlign: 'center',
                  maxWidth: 300,
                }}
              >
                {errorMsg}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: 'transparent',
                    color: '#9ca3af', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetry}
                  style={{
                    padding: '7px 16px', borderRadius: 7, fontSize: 12,
                    border: '1px solid rgba(37,99,235,0.3)',
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    color: '#60a5fa', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
