'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

export default function ExportButton() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/instagram/export')
      if (!res.ok) { setLoading(false); return }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `instagram-analytics-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
        backgroundColor: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
        color: loading ? '#4b5563' : '#9ca3af',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <Download style={{ width: 13, height: 13 }} />
      {loading ? 'Exporting…' : 'Export CSV'}
    </button>
  )
}
