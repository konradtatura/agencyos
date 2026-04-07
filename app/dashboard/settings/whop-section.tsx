'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, RefreshCw, Zap } from 'lucide-react'

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Props are used only as the initial hint; we always re-fetch on mount so the
// displayed state always reflects the actual DB value, even after a Next.js
// navigation re-renders the server component with stale cached props.
interface Props {
  connected:    boolean
  lastSyncedAt: string | null
}

export default function WhopSection({ connected: initialConnected, lastSyncedAt: initialSynced }: Props) {
  const [apiKey,     setApiKey]     = useState('')
  const [companyId,  setCompanyId]  = useState('')
  const [connected,  setConnected]  = useState(initialConnected)
  const [lastSynced, setLastSynced] = useState(initialSynced)
  const [saving,     setSaving]     = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [saveErr,    setSaveErr]    = useState<string | null>(null)
  const [syncMsg,    setSyncMsg]    = useState<string | null>(null)

  // On mount, fetch live connection status so we're never out of sync with the DB.
  useEffect(() => {
    fetch('/api/revenue/whop/connect')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data == null) return
        setConnected(!!data.connected)
        if (data.last_synced_at) setLastSynced(data.last_synced_at)
        if (data.company_id)     setCompanyId(data.company_id)
      })
      .catch(() => { /* network failure — keep prop value */ })
  }, [])

  async function refreshStatus() {
    try {
      const r = await fetch('/api/revenue/whop/connect')
      if (!r.ok) return
      const data = await r.json()
      setConnected(!!data.connected)
      if (data.last_synced_at) setLastSynced(data.last_synced_at)
      if (data.company_id)     setCompanyId(data.company_id)
    } catch { /* ignore */ }
  }

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveErr(null)
    try {
      const res = await fetch('/api/revenue/whop/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim(), company_id: companyId.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setSaveErr(json.error ?? 'Save failed'); return }
      // Re-fetch from server to confirm the key was persisted.
      await refreshStatus()
      setApiKey('')
    } catch {
      setSaveErr('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/revenue/whop/sync', { method: 'POST' })
      const json = await res.json()
      // Only update the sync message + timestamp — never touch connected state.
      // The sync endpoint does not change whether the key is valid.
      if (!res.ok) {
        setSyncMsg(json.error ?? 'Sync failed')
        return
      }
      setLastSynced(new Date().toISOString())
      setSyncMsg(
        json.debug
          ? 'Debug mode — raw data returned, no records synced yet'
          : `Synced: ${json.synced ?? 0} records`
      )
    } catch {
      setSyncMsg('Network error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(124,58,237,0.15)' }}
        >
          <Zap className="h-5 w-5 text-[#a78bfa]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">Whop</p>

          {connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </span>
                {lastSynced && (
                  <span className="text-[12px] text-[#6b7280]">
                    Last synced {fmt(lastSynced)}
                  </span>
                )}
              </div>

              {companyId && (
                <p className="text-[12px] text-[#6b7280]">
                  Company ID: <span className="font-mono text-[#9ca3af]">{companyId}</span>
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </button>

                <button
                  onClick={() => setConnected(false)}
                  className="text-[12px] text-[#6b7280] hover:text-[#9ca3af]"
                >
                  Change API key
                </button>
              </div>

              {syncMsg && (
                <p className="text-[12px] text-[#a78bfa]">{syncMsg}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[12.5px] text-[#6b7280]">
                Connect your Whop account to automatically sync payments as sales.
              </p>

              <div className="space-y-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API key"
                  className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
                  style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <input
                  type="text"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  placeholder="Company ID (biz_…)"
                  className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
                  style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !apiKey.trim()}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#7c3aed' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              {saveErr && (
                <p className="text-[12px] text-[#f87171]">{saveErr}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
