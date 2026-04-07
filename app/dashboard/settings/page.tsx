import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import { isTokenExpired } from '@/lib/instagram/token'
import DisconnectButton from './disconnect-button'
import WhopSection from './whop-section'
import { AlertTriangle, CheckCircle2, Link2 } from 'lucide-react'

function IgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day:   'numeric',
    year:  'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <h2
      className="mb-4 text-[11px] font-semibold uppercase tracking-widest"
      style={{ color: '#6b7280' }}
    >
      {title}
    </h2>
  )
}

function IntegrationRow({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: '#111827',
        border:          '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  type IgIntegration = {
    status:     string
    expires_at: string | null
    meta:       { ig_user_id?: string; username?: string }
  }

  let integration: IgIntegration | null = null
  let ghlLocationId: string | null = null
  let whopConnected = false
  let whopLastSynced: string | null = null

  if (user) {
    // Admin client bypasses RLS — identity already verified by getUser() above.
    const admin = createAdminClient()

    // Base profile — ghl_location_id is a stable column, always query it separately
    // so that missing whop columns (migration not yet applied) never break this fetch.
    const { data: profile } = await admin
      .from('creator_profiles')
      .select('id, ghl_location_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile?.id) {
      ghlLocationId = profile.ghl_location_id ?? null

      // Whop columns — added in migration 023; guard against them not existing yet.
      const { data: whopRow } = await admin
        .from('creator_profiles')
        .select('whop_api_key_enc, whop_last_synced_at')
        .eq('id', profile.id)
        .maybeSingle()

      whopConnected  = !!whopRow?.whop_api_key_enc
      whopLastSynced = whopRow?.whop_last_synced_at ?? null

      const { data } = await admin
        .from('integrations')
        .select('status, expires_at, meta')
        .eq('creator_id', profile.id)
        .eq('platform', 'instagram')
        .maybeSingle()

      if (data) {
        integration = data as IgIntegration
      }
    }
  }

  const isConnected = integration?.status === 'active'
  const expiring    = isConnected && isTokenExpired(integration!.expires_at)
  const username    = integration?.meta?.username ?? null

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your account and integrations." />

      {/* ── Integrations ───────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionHeading title="Integrations" />

        <IntegrationRow>
          <div className="flex items-start justify-between gap-4">
            {/* Left: icon + info */}
            <div className="flex items-start gap-4">
              {/* Instagram gradient icon */}
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)',
                }}
              >
                <IgIcon className="h-5 w-5 text-white" />
              </div>

              <div>
                <p className="mb-0.5 text-[14px] font-semibold text-[#f9fafb]">Instagram</p>

                {isConnected ? (
                  <>
                    {/* Connected state */}
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: expiring
                            ? 'rgba(245,158,11,0.12)'
                            : 'rgba(16,185,129,0.12)',
                          color: expiring ? '#fbbf24' : '#34d399',
                        }}
                      >
                        {expiring ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {expiring ? 'Expiring soon' : 'Connected'}
                      </span>
                    </div>

                    {username && (
                      <p className="mb-0.5 text-[13px] text-[#d1d5db]">
                        @{username}
                      </p>
                    )}

                    {integration!.expires_at && (
                      <p
                        className="text-[12px]"
                        style={{ color: expiring ? '#fbbf24' : '#6b7280' }}
                      >
                        {expiring ? 'Token expires ' : 'Token valid until '}
                        {formatExpiry(integration!.expires_at)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {/* Not connected state */}
                    <span
                      className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        color:           '#f87171',
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                      Not connected
                    </span>
                    <p className="text-[12.5px] text-[#6b7280]">
                      Connect your Instagram Business account to enable growth tracking.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Right: action button */}
            <div className="shrink-0">
              {isConnected ? (
                <div className="flex flex-col items-end gap-2">
                  <DisconnectButton />
                  {expiring && (
                    <a
                      href="/api/instagram/connect"
                      className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors"
                      style={{ backgroundColor: '#2563eb' }}
                    >
                      Reconnect
                    </a>
                  )}
                </div>
              ) : (
                <a
                  href="/api/instagram/connect"
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors"
                  style={{
                    background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)',
                  }}
                >
                  <IgIcon className="h-3.5 w-3.5" />
                  Connect Instagram
                </a>
              )}
            </div>
          </div>
        </IntegrationRow>
      </section>

      {/* ── Whop ───────────────────────────────────────────────────── */}
      <section className="mt-6">
        <WhopSection connected={whopConnected} lastSyncedAt={whopLastSynced} />
      </section>

      {/* ── GHL ────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionHeading title="GoHighLevel" />

        <IntegrationRow>
          <div className="flex items-start gap-4">
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(37,99,235,0.12)' }}
            >
              <Link2 className="h-5 w-5 text-[#2563eb]" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[14px] font-semibold text-[#f9fafb]">GHL Location</p>

              {ghlLocationId ? (
                <>
                  <span
                    className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </span>
                  <p className="mt-2 text-[12px] text-[#6b7280]">Location ID</p>
                  <p className="font-mono text-[13px] text-[#d1d5db] break-all">{ghlLocationId}</p>
                  <p className="mt-2 text-[12px] text-[#4b5563]">
                    To change this, contact your agency admin.
                  </p>
                </>
              ) : (
                <>
                  <span
                    className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: 'rgba(107,114,128,0.12)', color: '#6b7280' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#6b7280]" />
                    Not connected
                  </span>
                  <p className="mt-1 text-[12.5px] text-[#6b7280]">
                    Your agency admin can link a GHL location to enable funnel tracking.
                  </p>
                </>
              )}
            </div>
          </div>
        </IntegrationRow>
      </section>
    </div>
  )
}
