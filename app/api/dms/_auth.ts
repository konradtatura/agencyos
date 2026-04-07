/**
 * Shared auth helpers for DM API routes.
 * Uses the admin client (RLS bypassed) and enforces access control manually.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCreatorId } from '@/lib/get-creator-id'

export type DmUser = {
  admin: ReturnType<typeof createAdminClient>
  userId: string
  role: string
  creatorId: string | null
}

export type DmConversation = {
  id: string
  creator_id: string
  ig_conversation_id: string | null
  ig_user_id: string
  ig_username: string | null
  ig_profile_pic: string | null
  assigned_setter_id: string | null
  status: string
  story_sequence_id: string | null
  post_id: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
}

export type DmUserResult   = { error: NextResponse } | DmUser
export type DmConvResult   = { error: NextResponse } | (DmUser & { conversation: DmConversation })

export async function resolveDmUser(): Promise<DmUserResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()

  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = userRow?.role ?? 'creator'

  const creatorId = await getCreatorId()

  // super_admin impersonating a creator → behave like that creator
  if (role === 'super_admin' && creatorId) {
    return { admin, userId: user.id, role: 'creator', creatorId }
  }

  if (role === 'creator' && !creatorId) {
    return { error: NextResponse.json({ error: 'Creator profile not found' }, { status: 404 }) }
  }

  return { admin, userId: user.id, role, creatorId }
}

/**
 * Authenticate + verify the caller has access to the given conversation.
 * - creator:     owns the conversation (creator_id matches their profile)
 * - setter:      assigned to the conversation OR unassigned within their creator
 * - super_admin: always allowed
 */
export async function resolveDmConversation(conversationId: string): Promise<DmConvResult> {
  const authResult = await resolveDmUser()
  if ('error' in authResult) return authResult

  const { admin, userId, role, creatorId } = authResult

  const { data: conv } = await admin
    .from('dm_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) {
    return { error: NextResponse.json({ error: 'Conversation not found' }, { status: 404 }) }
  }

  const isSuperAdmin = role === 'super_admin'
  const isCreator    = role === 'creator' && conv.creator_id === creatorId

  // Setter: check team_members to confirm they belong to this creator
  let isSetterWithAccess = false
  if (role === 'setter') {
    if (conv.assigned_setter_id === userId) {
      isSetterWithAccess = true
    } else if (conv.assigned_setter_id === null) {
      const { data: membership } = await admin
        .from('team_members')
        .select('id')
        .eq('creator_id', conv.creator_id)
        .eq('user_id', userId)
        .maybeSingle()
      isSetterWithAccess = !!membership
    }
  }

  if (!isSuperAdmin && !isCreator && !isSetterWithAccess) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, userId, role, creatorId, conversation: conv as DmConversation }
}
