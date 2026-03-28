'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, ChevronDown, Loader2, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'

const NICHES = [
  'Coaching',
  'Consulting',
  'Course Creator',
  'Fitness',
  'Finance',
  'Content Creator',
  'Other',
] as const

const FIELD_LABEL = 'block text-[12.5px] font-medium mb-1.5 text-[#9ca3af]'

export default function AddCreatorPanel() {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen]         = useState(false)
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [niche, setNiche]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  function resetForm() {
    setName('')
    setEmail('')
    setNiche('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm()
    setOpen(next)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/admin/creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, niche: niche || undefined }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        return
      }

      // Success
      toast({
        title: 'Creator invited',
        description: `Invite email sent to ${email.trim().toLowerCase()}.`,
      })
      setOpen(false)
      resetForm()
      router.refresh() // re-fetches server component data
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors"
        style={{ backgroundColor: '#2563eb' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
      >
        <UserPlus className="h-4 w-4" />
        Add Creator
      </button>

      {/* Panel */}
      <SheetContent
        className="flex flex-col border-l p-0 sm:max-w-[440px]"
        style={{
          backgroundColor: '#0d1117',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {/* Header */}
        <SheetHeader className="border-b px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <SheetTitle className="text-[15px] font-semibold text-[#f9fafb]">
            Add New Creator
          </SheetTitle>
          <SheetDescription className="text-[13px] text-[#9ca3af]">
            Creates an account and sends an invite email. The creator sets
            their password when they accept.
          </SheetDescription>
        </SheetHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="space-y-5 px-6 py-6">

            {/* Full name */}
            <div>
              <label htmlFor="creator-name" className={FIELD_LABEL}>
                Full name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="creator-name"
                type="text"
                required
                autoComplete="off"
                placeholder="e.g. Sarah Johnson"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="input-field"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="creator-email" className={FIELD_LABEL}>
                Email address <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="creator-email"
                type="email"
                required
                autoComplete="off"
                placeholder="sarah@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="input-field"
              />
            </div>

            {/* Niche */}
            <div>
              <label htmlFor="creator-niche" className={FIELD_LABEL}>
                Niche
              </label>
              <div className="relative">
                <select
                  id="creator-niche"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  disabled={loading}
                  className="input-field appearance-none pr-9"
                  style={{
                    // ensure option backgrounds work in dark mode
                    colorScheme: 'dark',
                  }}
                >
                  <option value="">Select a niche…</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
                />
              </div>
            </div>

            {/* Error */}
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

          {/* Footer actions */}
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
              disabled={loading || !name.trim() || !email.trim()}
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
                  Sending invite…
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Send Invite
                </>
              )}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
