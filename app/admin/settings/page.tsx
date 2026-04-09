'use client'

import { useEffect, useState } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/page-header'

// ── Tally API Key section ─────────────────────────────────────────────────────

function TallyKeySection() {
  const [configured, setConfigured]   = useState<boolean | null>(null)
  const [updatedAt, setUpdatedAt]     = useState<string | null>(null)
  const [apiKey, setApiKey]           = useState('')
  const [saving, setSaving]           = useState(false)
  const [success, setSuccess]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/tally/key')
      .then((r) => r.json())
      .then((d: { configured?: boolean; updated_at?: string | null }) => {
        setConfigured(d.configured ?? false)
        setUpdatedAt(d.updated_at ?? null)
      })
      .catch(() => setConfigured(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res  = await fetch('/api/admin/tally/key', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const data = await res.json() as { success?: boolean; error?: string }

      if (!data.success) {
        setError(data.error ?? 'Failed to save key')
        return
      }

      setConfigured(true)
      setUpdatedAt(new Date().toISOString())
      setApiKey('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Tally icon */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.15)' }}
          >
            <svg viewBox="0 0 32 32" className="h-4.5 w-4.5 h-[18px] w-[18px]" fill="none" aria-hidden>
              <rect x="2"  y="5"  width="28" height="4" rx="2" fill="#2563eb" />
              <rect x="2"  y="14" width="20" height="4" rx="2" fill="#2563eb" opacity=".6" />
              <rect x="2"  y="23" width="14" height="4" rx="2" fill="#2563eb" opacity=".3" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#f9fafb]">Tally Integration</p>
            <p className="text-[12px] text-[#6b7280]">Agency-level API key used for all creators</p>
          </div>
        </div>

        {/* Status badge */}
        {configured === true && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            Connected
          </span>
        )}
        {configured === false && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#6b7280' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#6b7280]" />
            Not configured
          </span>
        )}
      </div>

      {/* Last updated */}
      {configured && updatedAt && (
        <p className="mb-4 text-[12px] text-[#6b7280]">
          Last updated: {formatDate(updatedAt)}
        </p>
      )}

      {/* Key form */}
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">
            {configured ? 'Rotate API key' : 'API key'}
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="tly-xxxxxxxxxxxxxxxxxxxx"
            className="w-full rounded-lg px-3.5 py-2.5 font-mono text-[13px] text-[#f9fafb] outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(37,99,235,0.5)')}
            onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            autoComplete="off"
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            API key saved and validated
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !apiKey.trim()}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          {saving ? 'Saving…' : configured ? 'Rotate Key' : 'Save Key'}
        </button>
      </form>

      <p className="mt-3 text-[11.5px] text-[#4b5563]">
        Find your key at{' '}
        <span className="text-[#6b7280]">tally.so → Settings → API keys</span>
      </p>
    </div>
  )
}

// ── GHL API Key section ───────────────────────────────────────────────────────

function GhlKeySection() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [updatedAt, setUpdatedAt]   = useState<string | null>(null)
  const [apiKey, setApiKey]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [origin, setOrigin]         = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    fetch('/api/admin/ghl/key')
      .then((r) => r.json())
      .then((d: { configured?: boolean; updated_at?: string | null }) => {
        setConfigured(d.configured ?? false)
        setUpdatedAt(d.updated_at ?? null)
      })
      .catch(() => setConfigured(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res  = await fetch('/api/admin/ghl/key', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const data = await res.json() as { success?: boolean; error?: string }

      if (!data.success) {
        setError(data.error ?? 'Failed to save key')
        return
      }

      setConfigured(true)
      setUpdatedAt(new Date().toISOString())
      setApiKey('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* GHL icon */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.15)' }}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#2563eb" opacity=".15" />
              <path d="M12 6v6l4 2" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" stroke="#2563eb" strokeWidth="1.75" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#f9fafb]">GHL Integration</p>
            <p className="text-[12px] text-[#6b7280]">Agency-level API key used for all creators</p>
          </div>
        </div>

        {/* Status badge */}
        {configured === true && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            Connected
          </span>
        )}
        {configured === false && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#6b7280' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#6b7280]" />
            Not configured
          </span>
        )}
      </div>

      {/* Last updated */}
      {configured && updatedAt && (
        <p className="mb-4 text-[12px] text-[#6b7280]">
          Last updated: {formatDate(updatedAt)}
        </p>
      )}

      {/* Key form */}
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-[#9ca3af]">
            {configured ? 'Rotate API key' : 'API key'}
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVC..."
            className="w-full rounded-lg px-3.5 py-2.5 font-mono text-[13px] text-[#f9fafb] outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(37,99,235,0.5)')}
            onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            autoComplete="off"
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            API key saved
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !apiKey.trim()}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          {saving ? 'Saving…' : configured ? 'Rotate Key' : 'Save Key'}
        </button>
      </form>

      <p className="mt-3 text-[11.5px] text-[#4b5563]">
        GHL Location IDs are set per creator in the{' '}
        <span className="text-[#6b7280]">Creators page</span>.
      </p>

      {/* Webhook URL */}
      <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="mb-2 text-[12px] font-medium text-[#9ca3af]">Webhook URL</p>
        <p className="mb-2 text-[11.5px] text-[#6b7280]">
          Add this URL as a webhook in your GHL workflow (Automation → Webhooks) to sync booked appointments.
        </p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 truncate rounded-lg px-3 py-2 text-[11.5px] font-mono"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#d1d5db',
            }}
          >
            {origin ? `${origin}/api/webhooks/ghl` : 'Loading…'}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`${origin}/api/webhooks/ghl`)}
            className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#9ca3af',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Agency-wide configuration" />

      <div className="max-w-xl space-y-6">
        <TallyKeySection />
        <GhlKeySection />
      </div>
    </>
  )
}
