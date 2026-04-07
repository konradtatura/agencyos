/**
 * GET  /api/admin/team  — all team members joined with user + creator name (admin only)
 * POST /api/admin/team  — invite a new setter or closer
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('team_members')
    .select(`
      id,
      role,
      active,
      created_at,
      user_id,
      creator_id,
      users!team_members_user_id_fkey (
        id,
        full_name,
        email,
        role
      ),
      creator_profiles!team_members_creator_id_fkey (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await guardAdmin()
  if ('error' in guard) return guard.error

  let body: { email?: string; full_name?: string; role?: string; creator_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email, full_name, role, creator_id } = body

  if (!email?.trim())      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!full_name?.trim())  return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  if (!role || !['setter', 'closer'].includes(role)) {
    return NextResponse.json({ error: 'Role must be setter or closer' }, { status: 400 })
  }
  if (!creator_id) return NextResponse.json({ error: 'Assigned creator is required' }, { status: 400 })

  const admin = createAdminClient()

  // ── Step 1: invite via Supabase Auth ──────────────────────────────────────
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    {
      data: {
        full_name: full_name.trim(),
        role,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    }
  )

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  const newUserId = invite.user.id

  // ── Step 2: set role in app_metadata (tamper-proof) ──────────────────────
  await admin.auth.admin.updateUserById(newUserId, {
    app_metadata: { role },
  })

  // ── Step 3: ensure public.users row exists with correct role ─────────────
  // The trigger fires on auth user creation but may set role from user_metadata.
  // Upsert to guarantee correct role.
  const { error: userError } = await admin
    .from('users')
    .upsert(
      {
        id:        newUserId,
        email:     email.trim().toLowerCase(),
        full_name: full_name.trim(),
        role,
      },
      { onConflict: 'id' }
    )

  if (userError) {
    await admin.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
  }

  // ── Step 4: insert into team_members ─────────────────────────────────────
  const { error: teamError } = await admin.from('team_members').insert({
    user_id:    newUserId,
    creator_id,
    role,
    active:     true,
  })

  if (teamError) {
    await admin.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: 'Failed to add to team' }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: newUserId }, { status: 201 })
}
