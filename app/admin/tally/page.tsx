'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import PageHeader from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ────────────────────────────────────────────────────────────────────

interface Creator {
  id: string
  name: string
}

interface TallyForm {
  id: string
  tally_form_id: string
  name: string | null
  workspace_name: string | null
  total_submissions: number
  last_synced_at: string | null
  is_qualification_form: boolean
  creator_id: string | null
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

// ── Assignment dropdown ───────────────────────────────────────────────────────

function AssignDropdown({ formId, creatorId, creators, onChange }: {
  formId:    string
  creatorId: string | null
  creators:  Creator[]
  onChange:  (formId: string, creatorId: string | null) => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value || null
    setSaving(true)
    try {
      await fetch(`/api/admin/tally/forms/${formId}/assign`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ creator_id: val }),
      })
      onChange(formId, val)
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={creatorId ?? ''}
      onChange={handleChange}
      disabled={saving}
      className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        border:          '1px solid rgba(255,255,255,0.1)',
        color:           creatorId ? '#f9fafb' : '#6b7280',
      }}
    >
      <option value="">— Unassigned —</option>
      {creators.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTallyPage() {
  const [forms, setForms]       = useState<TallyForm[]>([])
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/tally/forms')
      if (!res.ok) return
      const data = await res.json() as { forms: TallyForm[]; creators: Creator[] }
      setForms(data.forms ?? [])
      setCreators(data.creators ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    setSyncError(null)
    try {
      const res  = await fetch('/api/tally/sync', { method: 'POST' })
      const data = await res.json() as { forms?: number; submissions?: number; error?: string; warning?: string }
      if (!res.ok) {
        setSyncError(data.error ?? 'Sync failed')
        return
      }
      if (data.warning) {
        setSyncError(data.warning)
      } else {
        setSyncMsg(`Synced ${data.forms} forms, ${data.submissions} submissions`)
      }
      await load()
    } catch {
      setSyncError('Network error')
    } finally {
      setSyncing(false)
    }
  }

  function handleAssign(formId: string, creatorId: string | null) {
    setForms((prev) => prev.map((f) => f.id === formId ? { ...f, creator_id: creatorId } : f))
  }

  // Group forms by workspace
  const workspaces = [...new Set(forms.map((f) => f.workspace_name ?? '—'))].sort()
  const byWorkspace = new Map(
    workspaces.map((ws) => [ws, forms.filter((f) => (f.workspace_name ?? '—') === ws)])
  )

  const assignedCount   = forms.filter((f) => f.creator_id).length
  const unassignedCount = forms.length - assignedCount

  return (
    <>
      <PageHeader
        title="Tally Forms"
        subtitle={`${forms.length} forms · ${assignedCount} assigned · ${unassignedCount} unassigned`}
      >
        {syncMsg && <span className="text-[12.5px] font-medium text-[#10b981]">{syncMsg}</span>}
        {syncError && <span className="text-[12.5px] font-medium text-[#ef4444]">{syncError}</span>}

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) => !syncing && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync All Forms'}
        </button>
      </PageHeader>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full bg-white/[0.06]" />)}
        </div>
      ) : forms.length === 0 ? (
        <div
          className="rounded-xl py-20 text-center"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[13.5px] font-medium text-[#9ca3af]">No forms synced yet</p>
          <p className="mt-1 text-[12px] text-[#6b7280]">Click &quot;Sync All Forms&quot; to pull from Tally</p>
        </div>
      ) : (
        <div className="space-y-6">
          {workspaces.map((ws) => (
            <div key={ws}>
              {/* Workspace header */}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">
                {ws}
              </p>

              <div
                className="overflow-hidden rounded-xl"
                style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Form', 'Submissions', 'Last synced', 'Assigned to'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(byWorkspace.get(ws) ?? []).map((form, i, arr) => (
                      <tr
                        key={form.id}
                        style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                      >
                        {/* Name */}
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-medium text-[#f9fafb]">
                            {form.name ?? form.tally_form_id}
                          </p>
                          {form.is_qualification_form && (
                            <span className="text-[11px] text-[#10b981]">Qualification form</span>
                          )}
                        </td>

                        {/* Submissions */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-[13px] text-[#f9fafb]">
                            {form.total_submissions}
                          </span>
                        </td>

                        {/* Last synced */}
                        <td className="px-4 py-3">
                          <span className="text-[12.5px] text-[#9ca3af]">
                            {relativeTime(form.last_synced_at)}
                          </span>
                        </td>

                        {/* Assignment dropdown */}
                        <td className="px-4 py-3">
                          <AssignDropdown
                            formId={form.id}
                            creatorId={form.creator_id}
                            creators={creators}
                            onChange={handleAssign}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
