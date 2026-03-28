'use client'

import { useState, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, UserPlus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface TeamMember {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

interface NewLeadModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const SOURCE_TYPES = ['story', 'reel', 'organic', 'manual'] as const
const OFFER_TIERS = [
  { value: 'ht', label: 'HT — High Ticket' },
  { value: 'mt', label: 'MT — Medium Ticket' },
  { value: 'lt', label: 'LT — Low Ticket' },
] as const

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label
      style={{
        display: 'block', fontSize: 11.5, fontWeight: 500,
        color: '#9ca3af', marginBottom: 5, letterSpacing: '0.01em',
      }}
    >
      {children}
      {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 7,
  backgroundColor: '#070d19',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#f9fafb', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.12s',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
}

export default function NewLeadModal({ open, onClose, onSuccess }: NewLeadModalProps) {
  const [form, setForm] = useState({
    name: '',
    ig_handle: '',
    offer_tier: '',
    assigned_setter_id: '',
    lead_source_type: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [setters, setSetters] = useState<TeamMember[]>([])

  // Fetch setters when modal opens
  useEffect(() => {
    if (!open) return
    fetch('/api/team/members?role=setter')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSetters(data)
      })
      .catch(() => setSetters([]))
  }, [open])

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setForm({ name: '', ig_handle: '', offer_tier: '', assigned_setter_id: '', lead_source_type: '' })
      setErrors({})
    }
  }, [open])

  const set = useCallback((field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.offer_tier) newErrors.offer_tier = 'Offer tier is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, string | null> = {
        name: form.name.trim(),
        ig_handle: form.ig_handle.trim() || null,
        offer_tier: form.offer_tier,
        assigned_setter_id: form.assigned_setter_id || null,
        lead_source_type: form.lead_source_type || null,
      }

      const res = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to create lead')
      }

      toast({ title: 'Lead created', description: form.name.trim() })
      onSuccess()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 50,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 51,
            width: 440,
            backgroundColor: '#0d1117',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: '24px 24px 20px',
            outline: 'none',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  backgroundColor: 'rgba(37,99,235,0.12)',
                  border: '1px solid rgba(37,99,235,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <UserPlus size={14} color="#60a5fa" />
              </div>
              <div>
                <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb' }}>
                  New Lead
                </Dialog.Title>
                <p style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                  Added to DM'd — Stage 1
                </p>
              </div>
            </div>
            <button
              type="button"
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

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Full Name */}
              <div>
                <FieldLabel required>Full Name</FieldLabel>
                <input
                  style={{
                    ...inputStyle,
                    borderColor: errors.name ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)',
                  }}
                  placeholder="e.g. Alex Johnson"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  autoFocus
                />
                {errors.name && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.name}</p>
                )}
              </div>

              {/* Instagram Handle */}
              <div>
                <FieldLabel>Instagram Handle</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 13, color: '#4b5563', pointerEvents: 'none',
                    }}
                  >
                    @
                  </span>
                  <input
                    style={{ ...inputStyle, paddingLeft: 22 }}
                    placeholder="username"
                    value={form.ig_handle}
                    onChange={(e) => set('ig_handle', e.target.value.replace(/^@/, ''))}
                  />
                </div>
              </div>

              {/* Offer Tier + Lead Source — side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FieldLabel required>Offer Tier</FieldLabel>
                  <select
                    style={{
                      ...selectStyle,
                      borderColor: errors.offer_tier ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)',
                      color: form.offer_tier ? '#f9fafb' : '#4b5563',
                    }}
                    value={form.offer_tier}
                    onChange={(e) => set('offer_tier', e.target.value)}
                  >
                    <option value="" disabled>Select tier</option>
                    {OFFER_TIERS.map((t) => (
                      <option key={t.value} value={t.value} style={{ backgroundColor: '#0d1117' }}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {errors.offer_tier && (
                    <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{errors.offer_tier}</p>
                  )}
                </div>

                <div>
                  <FieldLabel>Lead Source</FieldLabel>
                  <select
                    style={{
                      ...selectStyle,
                      color: form.lead_source_type ? '#f9fafb' : '#4b5563',
                    }}
                    value={form.lead_source_type}
                    onChange={(e) => set('lead_source_type', e.target.value)}
                  >
                    <option value="" style={{ backgroundColor: '#0d1117' }}>Any</option>
                    {SOURCE_TYPES.map((s) => (
                      <option key={s} value={s} style={{ backgroundColor: '#0d1117' }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Assigned Setter */}
              <div>
                <FieldLabel>Assigned Setter</FieldLabel>
                <select
                  style={{
                    ...selectStyle,
                    color: form.assigned_setter_id ? '#f9fafb' : '#4b5563',
                  }}
                  value={form.assigned_setter_id}
                  onChange={(e) => set('assigned_setter_id', e.target.value)}
                >
                  <option value="" style={{ backgroundColor: '#0d1117' }}>Unassigned</option>
                  {setters.map((s) => (
                    <option key={s.id} value={s.id} style={{ backgroundColor: '#0d1117' }}>
                      {s.full_name ?? s.email ?? s.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex', gap: 8, justifyContent: 'flex-end',
                marginTop: 22, paddingTop: 18,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: 'transparent',
                  color: '#9ca3af', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '7px 20px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  border: 'none',
                  backgroundColor: submitting ? 'rgba(37,99,235,0.5)' : '#2563eb',
                  color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background-color 0.15s',
                }}
              >
                {submitting && <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} />}
                Create Lead
              </button>
            </div>
          </form>

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            input:focus, select:focus { border-color: rgba(37,99,235,0.5) !important; }
            select option { background-color: #0d1117; }
          `}</style>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
