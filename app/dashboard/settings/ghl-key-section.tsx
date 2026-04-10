'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Link2 } from 'lucide-react'

export default function GhlKeySection() {
  const [status, setStatus]   = useState<'loading'|'connected'|'disconnected'>('loading')
  const [apiKey, setApiKey]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/creator/ghl/key')
      .then(r => r.json())
      .then((d: { configured: boolean }) => {
        setStatus(d.configured ? 'connected' : 'disconnected')
      })
      .catch(() => setStatus('disconnected'))
  }, [])

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/creator/ghl/key', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Save failed'); return }
      setStatus('connected')
      setApiKey('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const INPUT_STYLE = {
    backgroundColor: '#1f2937',
    border: '1px solid rgba(255,255,255,0.08)',
  } as const

  return (
    <div
      className="rounded-xl p-5 mt-4"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-4">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(37,99,235,0.12)' }}
        >
          <Link2 className="h-5 w-5 text-[#2563eb]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">GHL Private Integration Key</p>
          <p className="mb-3 text-[12.5px] text-[#6b7280]">
            Your sub-account Private Integration token from GHL → Settings → Integrations → Private Integrations.
            Required for calendar sync and appointment tracking.
          </p>

          {status === 'loading' && (
            <div className="h-5 w-24 animate-pulse rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          )}

          {status === 'connected' && !success && (
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
              >
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
              <button
                onClick={() => setStatus('disconnected')}
                className="text-[12px] text-[#6b7280] hover:text-[#9ca3af]"
              >
                Rotate key
              </button>
            </div>
          )}

          {success && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
            >
              <CheckCircle2 className="h-3 w-3" />
              Saved successfully
            </span>
          )}

          {status === 'disconnected' && (
            <div className="space-y-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste your Private Integration token"
                className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
                style={INPUT_STYLE}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button
                onClick={handleSave}
                disabled={saving || !apiKey.trim()}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#2563eb' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {error && <p className="text-[12px] text-[#f87171]">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
