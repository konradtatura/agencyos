'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function DisconnectButton() {
  const router              = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleDisconnect() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/instagram/disconnect', { method: 'POST' })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Failed to disconnect.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleDisconnect}
        disabled={loading}
        className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50"
        style={{
          backgroundColor: 'rgba(239,68,68,0.08)',
          border:          '1px solid rgba(239,68,68,0.2)',
          color:           '#f87171',
        }}
        onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'
        }}
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Disconnecting…
          </span>
        ) : (
          'Disconnect'
        )}
      </button>
      {error && (
        <p className="text-[11.5px]" style={{ color: '#f87171' }}>{error}</p>
      )}
    </div>
  )
}
