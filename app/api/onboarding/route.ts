import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Action = 'brand' | 'advance' | 'complete'

export async function PATCH(request: NextRequest) {
  // Session client: identity verification only.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { action?: Action; name?: string; niche?: string; logo_url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { action } = body

  if (!action || !['brand', 'advance', 'complete'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Admin client: bypasses RLS — identity already verified above.
  // We scope every query to user.id so no cross-user access is possible.
  const admin = createAdminClient()

  const { data: profile, error: fetchError } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  if (action === 'brand') {
    const { name, niche, logo_url } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const { error } = await admin
      .from('creator_profiles')
      .update({
        name:            name.trim(),
        niche:           niche?.trim() || null,
        logo_url:        logo_url || null,
        onboarding_step: 2,
      })
      .eq('id', profile.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to save brand info' }, { status: 500 })
    }

    return NextResponse.json({ success: true, step: 2 })
  }

  if (action === 'advance') {
    const { error } = await admin
      .from('creator_profiles')
      .update({ onboarding_step: 3 })
      .eq('id', profile.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to advance step' }, { status: 500 })
    }

    return NextResponse.json({ success: true, step: 3 })
  }

  if (action === 'complete') {
    const { error } = await admin
      .from('creator_profiles')
      .update({ onboarding_complete: true, onboarding_step: 3 })
      .eq('id', profile.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }
}
