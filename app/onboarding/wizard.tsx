'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Camera, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function IgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

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

type Step = 1 | 2 | 3

interface Props {
  userId: string
  initialStep: Step
  initialName: string
  initialNiche: string
  logoUrl: string | null
  oauthError?: string | null
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const steps = [
    { num: 1, label: 'Your Brand' },
    { num: 2, label: 'Instagram' },
    { num: 3, label: 'Done' },
  ]

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((s, i) => (
          <div key={s.num} className="flex flex-1 items-center">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold transition-all"
                style={
                  step > s.num
                    ? { backgroundColor: '#10b981', color: '#fff' }
                    : step === s.num
                    ? { backgroundColor: '#2563eb', color: '#fff' }
                    : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#6b7280' }
                }
              >
                {step > s.num ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  s.num
                )}
              </div>
              <span
                className="mt-1.5 text-[11px] font-medium whitespace-nowrap"
                style={{ color: step >= s.num ? '#f9fafb' : '#6b7280' }}
              >
                {s.label}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className="mx-2 h-px flex-1 transition-all"
                style={{
                  backgroundColor: step > s.num ? '#2563eb' : 'rgba(255,255,255,0.08)',
                  marginBottom: '18px',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 1: Your Brand ────────────────────────────────────────────────────────

function StepBrand({
  userId,
  initialName,
  initialNiche,
  logoUrl,
  onNext,
}: {
  userId: string
  initialName: string
  initialNiche: string
  logoUrl: string | null
  onNext: (savedName: string) => void
}) {
  const [name, setName]           = useState(initialName)
  const [niche, setNiche]         = useState(initialNiche)
  const [preview, setPreview]     = useState<string | null>(logoUrl)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const fileRef                   = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const ext      = file.name.split('.').pop()
      const path     = `${userId}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('creator-avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('creator-avatars')
        .getPublicUrl(path)

      setPreview(publicUrl)
    } catch {
      setError('Failed to upload photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'brand', name, niche: niche || undefined, logo_url: preview }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.')
        return
      }

      onNext(name.trim())
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const initials = name.trim()
    ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Photo upload */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group relative flex h-20 w-20 items-center justify-center rounded-full transition-opacity disabled:opacity-60"
          style={{ backgroundColor: 'rgba(37,99,235,0.15)', border: '2px dashed rgba(37,99,235,0.4)' }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Avatar" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="text-[22px] font-bold text-[#60a5fa]">{initials}</span>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="mt-2 text-[12px] text-[#6b7280]">Click to upload photo</p>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="ob-name" className={FIELD_LABEL}>
          Full name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          id="ob-name"
          type="text"
          required
          autoComplete="off"
          placeholder="e.g. Sarah Johnson"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          className="input-field"
        />
      </div>

      {/* Niche */}
      <div>
        <label htmlFor="ob-niche" className={FIELD_LABEL}>Niche</label>
        <div className="relative">
          <select
            id="ob-niche"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            disabled={saving}
            className="input-field appearance-none pr-9"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">Select a niche…</option>
            {NICHES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
        </div>
      </div>

      {error && (
        <p className="rounded-lg px-3.5 py-3 text-[13px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: '#2563eb' }}
        onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = '#1d4ed8' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb' }}
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
        ) : (
          <>Continue <ArrowRight className="h-4 w-4" /></>
        )}
      </button>
    </form>
  )
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  instagram_denied:    'You cancelled the Instagram connection. Try again when you\'re ready.',
  invalid_state:       'The request expired or was invalid. Please try again.',
  token_exchange_failed: 'Could not complete authorisation with Facebook. Please try again.',
  long_token_failed:   'Could not obtain a long-lived token. Please try again.',
  pages_failed:        'Could not retrieve your Facebook Pages. Make sure your account has a linked Page.',
  no_pages:            'No Facebook Pages found on your account. You need at least one Page linked to an Instagram Business account.',
  no_instagram:        'No Instagram Business Account found linked to your Facebook Page. Make sure you have an Instagram Business or Creator account connected to a Facebook Page.',
  save_failed:         'Connected successfully but failed to save. Please try again.',
}

// ── Step 2: Connect Instagram ─────────────────────────────────────────────────

function StepInstagram({
  onSkip,
  oauthError,
}: {
  onSkip: () => void
  oauthError?: string | null
}) {
  const [connecting, setConnecting] = useState(false)
  const [skipping, setSkipping]     = useState(false)
  const [skipError, setSkipError]   = useState<string | null>(null)

  function handleConnect() {
    setConnecting(true)
    // Full-page navigation — Facebook will redirect back to /api/instagram/callback
    window.location.href = '/api/instagram/connect'
  }

  async function handleSkip() {
    setSkipping(true)
    setSkipError(null)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance' }),
      })

      if (!res.ok) {
        const json = await res.json()
        setSkipError(json.error ?? 'Something went wrong.')
        return
      }

      onSkip()
    } catch {
      setSkipError('Network error. Please check your connection.')
    } finally {
      setSkipping(false)
    }
  }

  const errorMessage =
    (oauthError && OAUTH_ERROR_MESSAGES[oauthError]) ??
    skipError

  return (
    <div className="space-y-6">
      {/* Instagram connect box */}
      <div
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Gradient icon */}
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)' }}
        >
          <IgIcon className="h-7 w-7 text-white" />
        </div>

        <p className="mb-1 text-[15px] font-semibold text-[#f9fafb]">Connect Instagram</p>
        <p className="mb-5 text-[13px] text-[#9ca3af]">
          Link your Instagram Business account so we can track your growth and manage messages.
        </p>

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)' }}
        >
          {connecting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Facebook…</>
          ) : (
            <><IgIcon className="h-4 w-4" /> Connect with Facebook</>
          )}
        </button>
      </div>

      {errorMessage && (
        <p
          className="rounded-lg px-3.5 py-3 text-[13px]"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#fca5a5',
          }}
        >
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        onClick={handleSkip}
        disabled={skipping}
        className="w-full text-center text-[13px] text-[#6b7280] transition-colors hover:text-[#9ca3af] disabled:opacity-50"
      >
        {skipping ? 'Skipping…' : 'Skip for now →'}
      </button>
    </div>
  )
}

// ── Step 3: Done ──────────────────────────────────────────────────────────────

function StepDone({ name }: { name: string }) {
  const router                  = useRouter()
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleGoToDashboard() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Something went wrong.')
        setLoading(false)
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Network error. Please check your connection.')
      setLoading(false)
    }
  }

  const firstName = name.trim().split(/\s+/)[0] || 'there'

  return (
    <div className="space-y-6 text-center">
      {/* Celebration icon */}
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
        style={{ backgroundColor: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}
      >
        🎉
      </div>

      <div>
        <p className="mb-2 text-[20px] font-bold text-[#f9fafb]">You&apos;re live, {firstName}!</p>
        <p className="text-[14px] text-[#9ca3af]">
          Your account is set up and ready to go. Head to your dashboard to see your growth overview.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="space-y-2.5 text-left">
        {[
          { icon: '📊', text: 'Track your Instagram growth in real time' },
          { icon: '✉️', text: 'Manage DMs and leads with your setter team' },
          { icon: '💰', text: 'Close deals with your closer team' },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[18px]">{icon}</span>
            <span className="text-[13px] text-[#d1d5db]">{text}</span>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg px-3.5 py-3 text-[13px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
          {error}
        </p>
      )}

      <button
        onClick={handleGoToDashboard}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-colors disabled:opacity-60"
        style={{ backgroundColor: '#10b981' }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#059669' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#10b981' }}
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…</>
        ) : (
          <>Go to Dashboard <ArrowRight className="h-4 w-4" /></>
        )}
      </button>
    </div>
  )
}

// ── Wizard shell ──────────────────────────────────────────────────────────────

export default function OnboardingWizard({
  userId,
  initialStep,
  initialName,
  initialNiche,
  logoUrl,
  oauthError,
}: Props) {
  const [step, setStep] = useState<Step>(initialStep || 1)
  const [name, setName] = useState(initialName)

  const STEP_TITLES: Record<Step, string> = {
    1: 'Set up your brand',
    2: 'Connect Instagram',
    3: "You're all set",
  }

  const STEP_SUBTITLES: Record<Step, string> = {
    1: "Tell us about yourself so we can personalise your experience.",
    2: 'Connect your Instagram account to unlock growth tracking.',
    3: "Everything is ready. Let's get to work.",
  }

  const topBannerMessage = oauthError === 'no_pages'
    ? 'Instagram connection failed. Make sure your Instagram Business account is linked to a Facebook Page, then try again.'
    : null

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#0a0f1e' }}
    >
      {/* Top-level OAuth error banner — shown above the card */}
      {topBannerMessage && (
        <div
          className="mb-5 w-full max-w-md rounded-xl px-4 py-3 text-[13px]"
          style={{
            backgroundColor: 'rgba(245,158,11,0.08)',
            border:          '1px solid rgba(245,158,11,0.25)',
            color:           '#fcd34d',
          }}
        >
          <span className="mr-1.5 font-semibold">⚠</span>
          {topBannerMessage}
        </div>
      )}

      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <span className="text-[13px] font-semibold tracking-widest text-[#2563eb] uppercase">
            AgencyOS
          </span>
        </div>

        {/* Progress */}
        <ProgressBar step={step} />

        {/* Step heading */}
        <div className="mb-6">
          <h1 className="mb-1 text-[20px] font-bold text-[#f9fafb]">{STEP_TITLES[step]}</h1>
          <p className="text-[13.5px] text-[#9ca3af]">{STEP_SUBTITLES[step]}</p>
        </div>

        {/* Step content */}
        {step === 1 && (
          <StepBrand
            userId={userId}
            initialName={name}
            initialNiche={initialNiche}
            logoUrl={logoUrl}
            onNext={(savedName) => {
              setName(savedName)
              setStep(2)
            }}
          />
        )}

        {step === 2 && (
          <StepInstagram
            onSkip={() => setStep(3)}
            oauthError={oauthError}
          />
        )}

        {step === 3 && (
          <StepDone name={name} />
        )}
      </div>
    </div>
  )
}
