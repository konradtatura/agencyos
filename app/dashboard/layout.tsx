import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Sidebar from '@/components/nav/sidebar'
import { isTokenExpired } from '@/lib/instagram/token'
import { AlertTriangle } from 'lucide-react'
import ImpersonationBanner from './impersonation-banner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = user.app_metadata?.role ?? user.user_metadata?.role

  // Setters and closers have their own namespaces — middleware redirects
  // them before this layout renders, but guard here too.
  if (role === 'setter') redirect('/setter/dms')
  if (role === 'closer') redirect('/closer/crm')

  // ── Impersonation ──────────────────────────────────────────────────────────
  let impersonatingId:   string | null = null
  let impersonatingName: string | null = null

  if (role === 'super_admin') {
    const cookieStore = await cookies()
    const impersonated = cookieStore.get('impersonating_creator_id')?.value
    if (impersonated) {
      impersonatingId = impersonated
      try {
        const admin = createAdminClient()
        const { data: cp } = await admin
          .from('creator_profiles')
          .select('name')
          .eq('id', impersonated)
          .single()
        impersonatingName = cp?.name ?? 'Unknown Creator'
      } catch { /* silently ignore */ }
    }
  }

  // Fetch the creator profile for the sidebar header.
  // Gracefully falls back to null values if the DB isn't wired up yet.
  let creatorName:  string | undefined
  let creatorNiche: string | undefined
  let igTokenExpiring = false

  if (role === 'creator') {
    try {
      const { data: profile } = await supabase
        .from('creator_profiles')
        .select('id, name, niche')
        .eq('user_id', user.id)
        .single()

      creatorName  = profile?.name  ?? undefined
      creatorNiche = profile?.niche ?? undefined

      if (profile?.id) {
        const { data: integration } = await supabase
          .from('integrations')
          .select('expires_at, status')
          .eq('creator_id', profile.id)
          .eq('platform', 'instagram')
          .maybeSingle()

        if (integration?.status === 'active') {
          igTokenExpiring = isTokenExpired(integration.expires_at)
        }
      }
    } catch {
      // Supabase not yet configured — silently fall back to defaults
    }
  }

  return (
    <div>
      {impersonatingId && impersonatingName && (
        <ImpersonationBanner
          creatorId={impersonatingId}
          creatorName={impersonatingName}
        />
      )}
      <Sidebar
        variant="creator"
        user={{
          email:     user.email!,
          full_name: user.user_metadata?.full_name ?? null,
          role:      role ?? 'creator',
        }}
        creatorName={creatorName}
        creatorNiche={creatorNiche}
      />
      <main
        style={{
          marginLeft:      '240px',
          minHeight:       '100vh',
          backgroundColor: '#0a0f1e',
          padding:         '32px',
          paddingTop:      impersonatingId ? '72px' : '32px',
        }}
      >
        {igTokenExpiring && (
          <div
            className="mb-6 flex items-center justify-between gap-4 rounded-xl px-4 py-3"
            style={{
              backgroundColor: 'rgba(245,158,11,0.08)',
              border:          '1px solid rgba(245,158,11,0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#f59e0b' }} />
              <p className="text-[13px]" style={{ color: '#fcd34d' }}>
                Your Instagram connection has expired. Reconnect to keep your data syncing.
              </p>
            </div>
            <a
              href="/api/instagram/connect"
              className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                backgroundColor: 'rgba(245,158,11,0.15)',
                color:           '#fbbf24',
                border:          '1px solid rgba(245,158,11,0.3)',
              }}
            >
              Reconnect
            </a>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
