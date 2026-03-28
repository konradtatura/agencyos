import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import OnboardingWizard from './wizard'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function OnboardingPage({ searchParams }: Props) {
  // Use the session client only for identity verification.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Use the admin client for all DB reads/writes so that RLS on
  // creator_profiles never blocks a legitimate onboarding user.
  const admin = createAdminClient()

  let { data: profile } = await admin
    .from('creator_profiles')
    .select('id, name, niche, logo_url, onboarding_step, onboarding_complete')
    .eq('user_id', user.id)
    .maybeSingle()

  // Auto-create the profile row if it doesn't exist yet
  // (race between inviteUserByEmail trigger and the admin creator API).
  if (!profile) {
    const fallbackName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split('@')[0] ??
      'Creator'

    const { data: created } = await admin
      .from('creator_profiles')
      .insert({
        user_id:             user.id,
        name:                fallbackName,
        onboarding_complete: false,
        onboarding_step:     1,
      })
      .select('id, name, niche, logo_url, onboarding_step, onboarding_complete')
      .single()

    profile = created
  }

  if (profile?.onboarding_complete) redirect('/dashboard')

  const { error: oauthError } = await searchParams

  return (
    <OnboardingWizard
      userId={user.id}
      initialStep={(profile?.onboarding_step as 1 | 2 | 3) || 1}
      initialName={profile?.name ?? ''}
      initialNiche={profile?.niche ?? ''}
      logoUrl={profile?.logo_url ?? null}
      oauthError={oauthError ?? null}
    />
  )
}
