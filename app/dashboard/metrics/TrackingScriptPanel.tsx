'use client'

import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getTrackingScript } from '@/lib/tracking/script'

export default function TrackingScriptPanel() {
  const [script, setScript] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('creator_profiles')
        .select('ghl_location_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const locationId = profile?.ghl_location_id ?? ''
      setScript(getTrackingScript(locationId))
    }
    load()
  }, [])

  function handleCopy() {
    if (!script) return
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      style={{
        backgroundColor: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-[#f9fafb]">Tracking Script</p>
          <p className="text-xs text-[#6b7280] mt-0.5">
            Paste into every GHL funnel page &rarr; Settings &rarr; Head Tracking Code.
            Set <code className="text-[#60a5fa]">FUNNEL_NAME</code> to match your funnel.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors"
          style={{
            backgroundColor: copied ? 'rgba(16,185,129,0.1)' : 'rgba(37,99,235,0.1)',
            color: copied ? '#10b981' : '#60a5fa',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(37,99,235,0.3)'}`,
          }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy Script'}
        </button>
      </div>
      <pre
        className="text-xs overflow-x-auto rounded-lg p-4"
        style={{
          backgroundColor: '#0d1117',
          color: '#9ca3af',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          maxHeight: 200,
          border: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {script || 'Loading…'}
      </pre>
    </div>
  )
}
