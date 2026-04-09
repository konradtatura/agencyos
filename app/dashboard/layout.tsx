import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import Sidebar from '@/components/nav/sidebar'
import { isTokenExpired } from '@/lib/instagram/token'
import { AlertTriangle } from 'lucide-react'
import { getSessionUser } from '@/lib/get-session-user'
import { getCreatorId } from '@/lib/get-creator-id'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  if (!user) redirect('/login')

  // Setters and closers have their own namespaces — middleware redirects
  // them before this layout renders, but guard here too.
  if (user.role === 'setter') redirect('/setter/dms')
  if (user.role === 'closer') redirect('/closer/crm')

  const admin = createAdminClient()

  // ── Impersonation ──────────────────────────────────────────────────────────
  let impersonatingId: string | null = null

  if (user.role === 'super_admin') {
    const cookieStore = await cookies()
    const impersonated = cookieStore.get('impersonating_creator_id')?.value
    if (impersonated) {
      impersonatingId = impersonated
    }
  }

  // ── DM unread badge ────────────────────────────────────────────────────────
  let dmUnreadCount = 0
  try {
    const creatorIdForDms = await getCreatorId()
    if (creatorIdForDms) {
      const { data: unreadRows } = await admin
        .from('dm_conversations')
        .select('unread_count')
        .eq('creator_id', creatorIdForDms)
        .gt('unread_count', 0)
      dmUnreadCount = (unreadRows ?? []).reduce((sum, r) => sum + (r.unread_count as number), 0)
    }
  } catch { /* non-critical */ }

  // ── Creator profile for sidebar + IG token check ──────────────────────────
  let creatorName:  string | undefined
  let creatorNiche: string | undefined
  let igTokenExpiring = false

  if (user.role === 'super_admin' && impersonatingId) {
    try {
      const { data: cp } = await admin
        .from('creator_profiles')
        .select('name, niche')
        .eq('id', impersonatingId)
        .single()
      creatorName  = cp?.name  ?? undefined
      creatorNiche = cp?.niche ?? undefined
    } catch { /* silently ignore */ }
  }

  if (user.role === 'creator') {
    try {
      const { data: profile } = await admin
        .from('creator_profiles')
        .select('id, name, niche')
        .eq('user_id', user.id)
        .single()

      creatorName  = profile?.name  ?? undefined
      creatorNiche = profile?.niche ?? undefined

      if (profile?.id) {
        const { data: integration } = await admin
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
      <Sidebar
        variant="creator"
        user={{
          email:     user.email,
          full_name: user.full_name,
          role:      user.role,
        }}
        creatorName={creatorName}
        creatorNiche={creatorNiche}
        dmUnreadCount={dmUnreadCount}
        isImpersonating={!!impersonatingId}
      />
      <main
        style={{
          marginLeft:      '240px',
          minHeight:       '100vh',
          backgroundColor: '#0a0f1e',
          padding:         '32px',
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
