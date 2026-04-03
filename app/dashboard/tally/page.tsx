'use client'

import { useEffect, useState, useCallback } from 'react'
import { Copy, RefreshCw, Check, AlertTriangle, ExternalLink } from 'lucide-react'
import PageHeader from '@/components/ui/page-header'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

interface TallyForm {
  id: string
  tally_form_id: string
  name: string | null
  workspace_name: string | null
  total_submissions: number
  last_synced_at: string | null
  is_qualification_form: boolean
  active: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatLastSynced(iso: string | null): string {
  if (!iso) return 'Never synced'
  return `Last synced ${relativeTime(iso)}`
}

// ── Connect form (not connected state) ───────────────────────────────────────

function ConnectForm({ onConnected }: { onConnected: () => void }) {
  const [apiKey, setApiKey]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/tally/connect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const data = await res.json() as { success?: boolean; error?: string; form_count?: number }

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Connection failed')
        return
      }

      onConnected()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="mx-auto mt-24 max-w-md rounded-2xl p-8 text-center"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Icon */}
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)' }}
      >
        <svg viewBox="0 0 48 48" className="h-7 w-7" fill="none" aria-hidden>
          <rect x="4" y="8" width="40" height="6" rx="3" fill="#2563eb" />
          <rect x="4" y="20" width="28" height="6" rx="3" fill="#2563eb" opacity=".6" />
          <rect x="4" y="32" width="20" height="6" rx="3" fill="#2563eb" opacity=".3" />
        </svg>
      </div>

      <h2 className="mb-2 text-[18px] font-semibold text-[#f9fafb]">Connect your Tally account</h2>
      <p className="mb-6 text-[13px] leading-relaxed text-[#9ca3af]">
        Sync your qualification forms and auto-create CRM leads from submissions
      </p>

      <form onSubmit={handleConnect} className="space-y-3">
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="tly-xxxxxxxxxxxxxxxxxxxx"
          className="w-full rounded-lg px-3.5 py-2.5 text-[13px] text-[#f9fafb] outline-none transition-colors"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(37,99,235,0.6)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          autoComplete="off"
        />

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !apiKey.trim()}
          className="w-full rounded-lg py-2.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          {loading ? 'Connecting…' : 'Connect Tally'}
        </button>
      </form>

      <p className="mt-4 text-[11.5px] text-[#6b7280]">
        Find your API key at{' '}
        <span className="font-medium text-[#9ca3af]">tally.so → Settings → API keys</span>
      </p>
    </div>
  )
}

// ── Webhook URL card ──────────────────────────────────────────────────────────

function WebhookCard() {
  const [copied, setCopied] = useState(false)
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/tally`

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="mb-6 rounded-xl p-4"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-[#6b7280]">
        Webhook URL
      </p>
      <div className="flex items-center gap-3">
        <code
          className="flex-1 truncate rounded-lg px-3 py-2 font-mono text-[12.5px] text-[#a5f3fc]"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {url}
        </code>
        <button
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
          style={{
            backgroundColor: copied ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)',
            color:            copied ? '#34d399' : '#9ca3af',
            border:           copied ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-[#6b7280]">
        Paste this into each form&apos;s settings in Tally under{' '}
        <span className="text-[#9ca3af]">Integrations → Webhook</span>
      </p>
    </div>
  )
}

// ── Forms table ───────────────────────────────────────────────────────────────

function FormsTable({ forms, onToggleQualification }: {
  forms: TallyForm[]
  onToggleQualification: (formId: string, value: boolean) => void
}) {
  if (forms.length === 0) {
    return (
      <div
        className="rounded-xl py-16 text-center"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-[13px] text-[#6b7280]">No forms synced yet — click Sync Now</p>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Form', 'Submissions', 'Last submission', 'Qualification form', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {forms.map((form, i) => (
            <tr
              key={form.id}
              style={{
                borderBottom: i < forms.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}
            >
              {/* Form name + workspace */}
              <td className="px-4 py-3">
                <p className="text-[13px] font-medium text-[#f9fafb]">
                  {form.name ?? form.tally_form_id}
                </p>
                {form.workspace_name && (
                  <p className="mt-0.5 text-[11.5px] text-[#6b7280]">{form.workspace_name}</p>
                )}
              </td>

              {/* Submissions count */}
              <td className="px-4 py-3">
                <span className="font-mono text-[13px] font-medium text-[#f9fafb]">
                  {form.total_submissions}
                </span>
              </td>

              {/* Last submission (using last_synced_at as proxy) */}
              <td className="px-4 py-3">
                <span className="text-[12.5px] text-[#9ca3af]">
                  {relativeTime(form.last_synced_at)}
                </span>
              </td>

              {/* Qualification toggle */}
              <td className="px-4 py-3">
                <div className="group relative flex items-center gap-2.5">
                  <Switch
                    checked={form.is_qualification_form}
                    onCheckedChange={(v) => onToggleQualification(form.id, v)}
                  />
                  {form.is_qualification_form && (
                    <span className="text-[11.5px] text-[#10b981]">Auto-creates leads</span>
                  )}
                  {/* Tooltip */}
                  <span
                    className="pointer-events-none absolute left-0 top-8 z-10 hidden rounded-lg px-2.5 py-1.5 text-[11.5px] text-[#f9fafb] group-hover:block"
                    style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}
                  >
                    New submissions will auto-create CRM leads
                  </span>
                </div>
              </td>

              {/* Actions */}
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/tally/${form.id}`}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  View submissions
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TallyPage() {
  const [connected, setConnected]   = useState<boolean | null>(null)
  const [forms, setForms]           = useState<TallyForm[]>([])
  const [loadingForms, setLoading]  = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState<string | null>(null)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [keyExpired, setKeyExpired] = useState(false)

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/tally/forms')
      if (res.status === 401) { setConnected(false); return }
      if (!res.ok)             { return }
      const data = await res.json() as { connected: boolean; forms: TallyForm[]; last_synced_at: string | null }
      setConnected(data.connected)
      if (data.connected) {
        setForms(data.forms ?? [])
        setLastSynced(data.last_synced_at)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadForms() }, [loadForms])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    setSyncError(null)
    try {
      const res  = await fetch('/api/tally/sync', { method: 'POST' })
      const data = await res.json() as { forms?: number; submissions?: number; error?: string }
      if (!res.ok) {
        if (res.status === 401) setKeyExpired(true)
        setSyncError(data.error ?? 'Sync failed')
        return
      }
      setSyncMsg(`Synced ${data.forms} form${data.forms !== 1 ? 's' : ''}, ${data.submissions} submission${data.submissions !== 1 ? 's' : ''}`)
      await loadForms()
    } catch {
      setSyncError('Network error — please try again')
    } finally {
      setSyncing(false)
    }
  }

  async function toggleQualification(formId: string, value: boolean) {
    // Optimistic update
    setForms((prev) => prev.map((f) => f.id === formId ? { ...f, is_qualification_form: value } : f))
    try {
      await fetch(`/api/tally/forms/${formId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_qualification_form: value }),
      })
    } catch {
      // Revert on error
      setForms((prev) => prev.map((f) => f.id === formId ? { ...f, is_qualification_form: !value } : f))
    }
  }

  // Loading state
  if (connected === null) {
    return (
      <div className="space-y-4">
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-7 w-32 bg-white/[0.06]" />
          <Skeleton className="h-9 w-28 bg-white/[0.06]" />
        </div>
        <Skeleton className="h-20 w-full bg-white/[0.06]" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-white/[0.06]" />)}
      </div>
    )
  }

  if (!connected) {
    return <ConnectForm onConnected={() => { setConnected(true); loadForms() }} />
  }

  return (
    <>
      {/* Expired key banner */}
      {keyExpired && (
        <div
          className="mb-6 flex items-center justify-between gap-4 rounded-xl px-4 py-3"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#ef4444' }} />
            <p className="text-[13px]" style={{ color: '#f87171' }}>
              Your Tally API key has expired.
            </p>
          </div>
          <button
            onClick={() => { setConnected(false); setKeyExpired(false) }}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            Reconnect
          </button>
        </div>
      )}

      <PageHeader
        title="Tally Forms"
        subtitle={lastSynced ? formatLastSynced(lastSynced) : 'Sync to pull your forms'}
      >
        {/* Sync feedback */}
        {syncMsg && (
          <span className="text-[12.5px] font-medium text-[#10b981]">{syncMsg}</span>
        )}
        {syncError && (
          <span className="text-[12.5px] font-medium text-[#ef4444]">{syncError}</span>
        )}

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) => !syncing && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </PageHeader>

      <WebhookCard />

      {loadingForms ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-white/[0.06]" />)}
        </div>
      ) : (
        <FormsTable forms={forms} onToggleQualification={toggleQualification} />
      )}
    </>
  )
}
