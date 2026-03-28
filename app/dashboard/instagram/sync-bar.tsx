'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SyncStatus {
  connected:   boolean
  ig_username: string | null
  last_sync:   string | null
  next_sync:   string | null
}

interface Props {
  initial:   SyncStatus
  autoSync?: boolean
}

type SyncPhase = 'idle' | 'account' | 'posts' | 'stories' | 'done' | 'error'

interface SseEvent {
  phase:        SyncPhase
  message?:     string
  fetched?:     number
  total?:       number
  post_count?:  number
  story_count?: number
  last_sync?:   string
}

// ── Time helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr  < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
}

function timeUntil(iso: string | null): string {
  if (!iso) return 'soon'
  const diffMs  = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return 'soon'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin} min`
  const diffHr = Math.round(diffMs / 3_600_000)
  return `~${diffHr} hour${diffHr !== 1 ? 's' : ''}`
}

// ── Progress label ─────────────────────────────────────────────────────────────

function PhaseLabel({
  phase,
  fetched,
  total,
  postCount,
  storyCount,
}: {
  phase:      SyncPhase
  fetched:    number
  total:      number
  postCount:  number | null
  storyCount: number | null
}) {
  if (phase === 'idle') return null

  if (phase === 'account') {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#60a5fa' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing account stats…
      </span>
    )
  }

  if (phase === 'posts') {
    const countStr = total > 0 ? ` (${fetched}/${total})` : ''
    return (
      <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#60a5fa' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {`Syncing posts${countStr}…`}
      </span>
    )
  }

  if (phase === 'stories') {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#60a5fa' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing stories…
      </span>
    )
  }

  if (phase === 'done') {
    const parts: string[] = []
    if (postCount !== null) parts.push(`${postCount} posts`)
    if (storyCount !== null) parts.push(`${storyCount} stories`)
    const detail = parts.length > 0 ? ` — ${parts.join(', ')} imported` : ''
    return (
      <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#34d399' }}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        {`Sync complete${detail}`}
      </span>
    )
  }

  return null
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SyncBar({ initial, autoSync = false }: Props) {
  const router = useRouter()

  const [status,    setStatus]    = useState<SyncStatus>(initial)
  const [syncing,   setSyncing]   = useState(false)
  const [phase,     setPhase]     = useState<SyncPhase>('idle')
  const [fetched,   setFetched]   = useState(0)
  const [total,     setTotal]     = useState(0)
  const [postCount,  setPostCount]  = useState<number | null>(null)
  const [storyCount, setStoryCount] = useState<number | null>(null)
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)
  const [, setTick]               = useState(0)
  const autoSyncFired             = useRef(false)

  // Tick every 30 s so timestamps refresh without reload
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const runSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    setPhase('account')
    setFetched(0)
    setTotal(0)
    setPostCount(null)
    setStoryCount(null)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/instagram/sync/stream', { method: 'POST' })

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '')
        setErrorMsg(`Sync failed${body ? `: ${body}` : ''}`)
        setPhase('error')
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines  = buffer.split('\n')
        buffer       = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as SseEvent
            if (evt.phase === 'account') {
              setPhase('account')
            } else if (evt.phase === 'posts') {
              setPhase('posts')
              if (evt.fetched !== undefined) setFetched(evt.fetched)
              if (evt.total   !== undefined) setTotal(evt.total)
            } else if (evt.phase === 'stories') {
              setPhase('stories')
            } else if (evt.phase === 'done') {
              setPhase('done')
              setPostCount(evt.post_count ?? null)
              setStoryCount(evt.story_count ?? null)
              // Refresh status timestamp
              if (evt.last_sync) {
                setStatus((s) => ({ ...s, last_sync: evt.last_sync! }))
              }
              // After 8 s clear banner and do a full page refresh to pick up new data
              setTimeout(() => {
                setPhase('idle')
                router.refresh()
              }, 8_000)
            } else if (evt.phase === 'error') {
              setPhase('error')
              setErrorMsg(evt.message ?? 'Sync failed. Please try again.')
            }
          } catch {
            // malformed event — ignore
          }
        }
      }
    } catch {
      setErrorMsg('Network error. Please check your connection.')
      setPhase('error')
    } finally {
      setSyncing(false)
    }
  }, [syncing, router])

  // Auto-sync on mount when no data exists
  useEffect(() => {
    if (autoSync && !autoSyncFired.current && status.connected) {
      autoSyncFired.current = true
      runSync()
    }
  }, [autoSync, status.connected, runSync])

  if (!status.connected) return null

  const isSyncing = syncing && phase !== 'done' && phase !== 'error'

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border:          '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left: phase label while syncing, timestamps otherwise */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {isSyncing || phase === 'done' ? (
          <PhaseLabel phase={phase} fetched={fetched} total={total} postCount={postCount} storyCount={storyCount} />
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#9ca3af' }}>
              <Clock className="h-3.5 w-3.5" />
              Last synced: <span style={{ color: '#d1d5db' }}>{relativeTime(status.last_sync)}</span>
            </span>
            {status.next_sync && (
              <span className="text-[12.5px]" style={{ color: '#6b7280' }}>
                Next sync: in {timeUntil(status.next_sync)}
              </span>
            )}
          </>
        )}
      </div>

      {/* Right: error + button */}
      <div className="flex items-center gap-3">
        {(phase === 'error' || errorMsg) && (
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: '#f87171' }}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {errorMsg}
          </span>
        )}

        <button
          onClick={runSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.2)' }}
          onMouseEnter={(e) => { if (!isSyncing) e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(37,99,235,0.12)' }}
        >
          {isSyncing
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…</>
            : <><RefreshCw className="h-3.5 w-3.5" /> Sync Now</>
          }
        </button>
      </div>
    </div>
  )
}
