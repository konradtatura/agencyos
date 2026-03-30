'use client'

import { useState } from 'react'
import { Code2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { getTrackingScript } from '@/lib/tracking/script'

export default function TrackingScriptPanel({ locationId }: { locationId: string | null }) {
  const [open, setOpen]     = useState(false)
  const [copied, setCopied] = useState(false)

  const script = locationId
    ? getTrackingScript(locationId)
    : getTrackingScript('YOUR_GHL_LOCATION_ID')

  function handleCopy() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117] mb-5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Code2 size={13} className="text-[#2563eb] shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
            Funnel Tracking Script
          </span>
          {!locationId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] font-medium">
              GHL location not connected
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/25">
            Paste into every GHL funnel page
          </span>
          {open
            ? <ChevronUp size={13} className="text-white/30 shrink-0" />
            : <ChevronDown size={13} className="text-white/30 shrink-0" />
          }
        </div>
      </button>

      {open && (
        <div className="border-t border-white/[0.06]">
          <div className="relative">
            <pre className="px-5 py-4 text-[11px] font-mono text-white/50 overflow-x-auto leading-relaxed max-h-64 scrollbar-thin">
              {script}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all text-[11px] font-medium text-white/50 hover:text-white/80"
            >
              {copied
                ? <><Check size={11} className="text-[#10b981]" /> Copied</>
                : <><Copy size={11} /> Copy</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
