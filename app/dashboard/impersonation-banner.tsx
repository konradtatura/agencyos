'use client'

import { useState } from 'react'
import { Eye, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ImpersonationBanner({
  creatorId,
  creatorName,
}: {
  creatorId: string
  creatorName: string
}) {
  const router  = useRouter()
  const [stopping, setStopping] = useState(false)

  async function handleStop() {
    setStopping(true)
    await fetch(`/api/admin/creators/${creatorId}/stop-impersonating`, { method: 'POST' })
    router.push('/admin')
  }

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-3 px-4 py-2.5 text-[13px] font-medium"
      style={{ backgroundColor: '#7c3aed', marginLeft: '240px' }}
    >
      <Eye className="h-4 w-4 shrink-0 text-white/80" />
      <span className="text-white">
        Viewing as: <span className="font-bold">{creatorName}</span>
      </span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="ml-2 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
      >
        <X className="h-3 w-3" />
        {stopping ? 'Stopping…' : 'Stop'}
      </button>
    </div>
  )
}
