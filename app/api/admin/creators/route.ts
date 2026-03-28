import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_NICHES = [
  'Coaching',
  'Consulting',
  'Course Creator',
  'Fitness',
  'Finance',
  'Content Creator',
  'Other',
] as const

export async function POST(request: NextRequest) {
  // ── Auth guard: caller must be super_admin ────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const callerRole = user.app_metadata?.role ?? user.user_metadata?.role
  if (callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: { name?: string; email?: string; niche?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, niche } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: 'Email address is required' }, { status: 400 })
  }
  if (niche && !VALID_NICHES.includes(niche as typeof VALID_NICHES[number])) {
    return NextResponse.json({ error: 'Invalid niche value' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Step 1: invite the user via Supabase Auth ─────────────────────────────
  // inviteUserByEmail creates the auth user, sends the invite email, and fires
  // the on_auth_user_created trigger which creates the public.users row.
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    {
      data: {
        full_name: name.trim(),
        role: 'creator', // written to user_metadata — trigger reads this
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    }
  )

  if (inviteError) {
    // Surface Supabase error messages (e.g. "User already registered")
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  const newUserId = invite.user.id

  // ── Step 2: promote role to app_metadata (tamper-proof) ──────────────────
  await admin.auth.admin.updateUserById(newUserId, {
    app_metadata: { role: 'creator' },
  })

  // ── Step 3: create the creator_profile row ────────────────────────────────
  // The trigger fired synchronously during step 1, so public.users exists now.
  const { error: profileError } = await admin.from('creator_profiles').insert({
    user_id: newUserId,
    name: name.trim(),
    niche: niche?.trim() || null,
    onboarding_complete: false,
    onboarding_step: 0,
  })

  if (profileError) {
    // Roll back: delete the orphaned auth user so we don't leave dangling state
    await admin.auth.admin.deleteUser(newUserId)
    return NextResponse.json(
      { error: 'Failed to create creator profile. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, userId: newUserId }, { status: 201 })
}
