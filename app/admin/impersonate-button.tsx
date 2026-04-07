'use client'

import { useState } from 'react'
import { LayoutDashboard, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ImpersonateButton({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await fetch(`/api/admin/creators/${creatorId}/impersonate`, { method: 'POST' })
    router.push('/dashboard')
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
      style={{ backgroundColor: '#2563eb' }}
      onMouseEnter={(e) => !loading && ((e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8')}
      onMouseLeave={(e) => !loading && ((e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb')}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <LayoutDashboard className="h-3.5 w-3.5" />
      }
      {loading ? 'Opening…' : 'View Dashboard'}
    </button>
  )
}
