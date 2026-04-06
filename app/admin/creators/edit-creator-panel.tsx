'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2, X, Check } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'

const FIELD_LABEL = 'block text-[12.5px] font-medium mb-1.5 text-[#9ca3af]'

type Props = {
  creatorId: string
  creatorName: string
  ghlLocationId: string | null
}

export default function EditCreatorPanel({ creatorId, creatorName, ghlLocationId }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen]           = useState(false)
  const [locationId, setLocationId] = useState(ghlLocationId ?? '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setLocationId(ghlLocationId ?? '')
      setError(null)
    }
    setOpen(next)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghl_location_id: locationId.trim() || null }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        return
      }

      toast({
        title: 'Creator updated',
        description: `GHL Location ID saved for ${creatorName}.`,
      })
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>

      <SheetContent
        className="flex flex-col border-l p-0 sm:max-w-[440px]"
        style={{
          backgroundColor: '#0d1117',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <SheetHeader className="border-b px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <SheetTitle className="text-[15px] font-semibold text-[#f9fafb]">
            Edit Creator
          </SheetTitle>
          <SheetDescription className="text-[13px] text-[#9ca3af]">
            {creatorName}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="space-y-5 px-6 py-6">

            <div>
              <label htmlFor="ghl-location-id" className={FIELD_LABEL}>
                GHL Location ID
              </label>
              <input
                id="ghl-location-id"
                type="text"
                autoComplete="off"
                placeholder="loc_xxxxxxxxxxxxxxxx"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={loading}
                className="input-field"
              />
              <p className="mt-1.5 text-[11.5px] text-[#4b5563]">
                Found in your GHL sub-account settings. Leave blank to disconnect.
              </p>
            </div>

            {error && (
              <div
                className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px]"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#fca5a5',
                }}
              >
                <X className="mt-px h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <div
            className="mt-auto flex items-center justify-end gap-3 border-t px-6 py-4"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: '#2563eb' }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#1d4ed8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb'
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
