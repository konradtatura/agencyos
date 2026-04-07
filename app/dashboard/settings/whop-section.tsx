'use client'

import { useState } from 'react'
import { CheckCircle2, RefreshCw, Zap } from 'lucide-react'

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  connected:      boolean
  lastSyncedAt:   string | null
}

export default function WhopSection({ connected: initialConnected, lastSyncedAt: initialSynced }: Props) {
  const [apiKey,     setApiKey]     = useState('')
  const [connected,  setConnected]  = useState(initialConnected)
  const [lastSynced, setLastSynced] = useState(initialSynced)
  const [saving,     setSaving]     = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [saveErr,    setSaveErr]    = useState<string | null>(null)
  const [syncMsg,    setSyncMsg]    = useState<string | null>(null)

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveErr(null)
    try {
      const res = await fetch('/api/revenue/whop/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setSaveErr(json.error ?? 'Save failed'); return }
      setConnected(true)
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
      if (!res.ok) { setSyncMsg(json.error ?? 'Sync failed'); return }
      setLastSynced(new Date().toISOString())
      setSyncMsg(`Synced: ${json.inserted ?? 0} new, ${json.updated ?? 0} updated`)
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
                Connect your Whop account to automatically sync memberships as sales.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="whop_sk_…"
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none focus:ring-1"
                  style={{
                    backgroundColor: '#1f2937',
                    border: '1px solid rgba(255,255,255,0.08)',
                    focusRingColor: '#7c3aed',
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !apiKey.trim()}
                  className="shrink-0 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

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
