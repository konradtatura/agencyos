'use client'

import { useEffect, useState, useCallback } from 'react'
import { Copy, RefreshCw, Check, ExternalLink } from 'lucide-react'
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
  return `${Math.floor(hrs / 24)}d ago`
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
        className="rounded-xl py-20 text-center"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(37,99,235,0.08)' }}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        </div>
        <p className="text-[13.5px] font-medium text-[#9ca3af]">No forms assigned to you yet</p>
        <p className="mt-1 text-[12px] text-[#6b7280]">Contact your admin to assign Tally forms to your account</p>
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
            {['Form', 'Submissions', 'Last synced', 'Qualification form', ''].map((h) => (
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
              style={{ borderBottom: i < forms.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
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

              {/* Submissions */}
              <td className="px-4 py-3">
                <span className="font-mono text-[13px] font-medium text-[#f9fafb]">
                  {form.total_submissions}
                </span>
              </td>

              {/* Last synced */}
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
  const [forms, setForms]           = useState<TallyForm[]>([])
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState<string | null>(null)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/tally/forms')
      if (!res.ok) return
      const data = await res.json() as { forms: TallyForm[]; last_synced_at: string | null }
      setForms(data.forms ?? [])
      setLastSynced(data.last_synced_at)
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
    setForms((prev) => prev.map((f) => f.id === formId ? { ...f, is_qualification_form: value } : f))
    try {
      await fetch(`/api/tally/forms/${formId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_qualification_form: value }),
      })
    } catch {
      setForms((prev) => prev.map((f) => f.id === formId ? { ...f, is_qualification_form: !value } : f))
    }
  }

  const subtitle = lastSynced
    ? `Last synced ${relativeTime(lastSynced)}`
    : 'Sync to pull the latest submissions'

  return (
    <>
      <PageHeader title="Tally Forms" subtitle={subtitle}>
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

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-white/[0.06]" />)}
        </div>
      ) : (
        <FormsTable forms={forms} onToggleQualification={toggleQualification} />
      )}
    </>
  )
}
