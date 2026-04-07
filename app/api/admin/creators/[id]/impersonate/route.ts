/**
 * POST /api/admin/creators/[id]/impersonate
 * Sets httpOnly cookie impersonating_creator_id={id}.
 * Super-admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const res = NextResponse.json({ success: true })
  res.cookies.set('impersonating_creator_id', id, {
    httpOnly: true,
    path:     '/',
    sameSite: 'lax',
    // Session cookie — cleared when browser closes
    maxAge:   60 * 60 * 8, // 8 hours safety cap
  })
  return res
}
