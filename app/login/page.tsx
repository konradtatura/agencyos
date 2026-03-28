'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getRoleFromUser, roleHome } from '@/lib/auth'

// ── Inner form — reads search params (must be inside Suspense) ───────────────

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Honour errors forwarded from the auth callback (e.g. expired magic link).
  useEffect(() => {
    const callbackError = searchParams.get('error')
    if (callbackError === 'auth_callback_failed') {
      setError('Authentication failed. Please try signing in again.')
    } else if (callbackError === 'missing_code') {
      setError('Invalid sign-in link. Please request a new one.')
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        // Supabase returns "Invalid login credentials" — keep it user-friendly.
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Incorrect email or password.'
            : authError.message
        )
        return
      }

      // Redirect to the ?next= param if present (e.g. after being bounced by middleware),
      // otherwise send to the role's home.
      const next = searchParams.get('next')
      if (next && next.startsWith('/')) {
        router.push(next)
      } else {
        const role = getRoleFromUser(data.user)
        router.push(roleHome(role))
      }

      // Flush server component cache so the new session is picked up immediately.
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="w-full max-w-[448px] rounded-2xl p-8"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          boxShadow: '0 32px 64px -16px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg"
               style={{ backgroundColor: 'rgba(37,99,235,0.15)' }}>
            <Zap className="h-4 w-4" style={{ color: 'var(--accent)' }} fill="currentColor" />
          </div>
          <span className="text-lg font-semibold tracking-tight"
                style={{ color: 'var(--text-primary)' }}>
            AgencyOS
          </span>
        </div>

        {/* ── Heading ──────────────────────────────────────────────────── */}
        <div className="mb-7">
          <h1 className="text-2xl font-semibold mb-1"
              style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Sign in to your workspace
          </p>
        </div>

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">

          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {showPassword
                  ? <EyeOff className="h-4 w-4" />
                  : <Eye    className="h-4 w-4" />
                }
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#fca5a5',
              }}
            >
              <span className="mt-px leading-snug">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="relative w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#fff',
              boxShadow: loading ? 'none' : '0 1px 2px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#1d4ed8'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent)'
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>

        </form>
      </div>
    </div>
  )
}

// ── Page export — wraps form in Suspense (required for useSearchParams) ───────

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center"
           style={{ backgroundColor: 'var(--bg-primary)' }} />
    }>
      <LoginForm />
    </Suspense>
  )
}
