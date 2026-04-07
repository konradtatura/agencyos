/**
 * GET /api/dms/[conversationId]/messages
 *
 * Returns all messages for this conversation ordered by sent_at asc.
 * Internal notes are included for all roles (flag available for future filtering).
 */

import { NextResponse } from 'next/server'
import { resolveDmConversation } from '../../_auth'

export async function GET(
  _req: Request,
  { params }: { params: { conversationId: string } },
) {
  const resolved = await resolveDmConversation(params.conversationId)
  if ('error' in resolved) return resolved.error

  const { admin, conversation } = resolved

  const { data: messages, error } = await admin
    .from('dm_messages')
    .select('id, ig_message_id, direction, message_text, sent_at, sender_id, is_internal_note')
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: true })

  if (error) {
    console.error('[dm-messages] failed to fetch messages:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(messages ?? [])
}
