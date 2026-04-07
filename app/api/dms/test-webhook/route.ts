/**
 * POST /api/dms/test-webhook
 *
 * Simulates an inbound DM for local testing — creates a fake dm_conversation
 * and dm_message as if Meta sent the webhook. Only callable by creator or super_admin.
 *
 * Body: { text?: string; senderUsername?: string }
 */

import { NextResponse } from 'next/server'
import { resolveDmUser } from '../_auth'

export async function POST(req: Request) {
  const authResult = await resolveDmUser()
  if ('error' in authResult) return authResult.error

  const { admin, role, creatorId } = authResult

  if (role !== 'creator' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Only creators and admins can use this endpoint' }, { status: 403 })
  }

  if (!creatorId) {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  let body: { text?: string; senderUsername?: string } = {}
  try {
    body = await req.json()
  } catch { /* use defaults */ }

  const senderUsername = body.senderUsername ?? 'test_user'
  const messageText    = body.text ?? 'Test message from webhook simulator'
  const fakeIgUserId   = `test_${senderUsername.replace(/\W/g, '_')}`
  const now            = new Date().toISOString()

  // Upsert the conversation (one test conversation per senderUsername per creator)
  const { data: conversation, error: convError } = await admin
    .from('dm_conversations')
    .upsert(
      {
        creator_id:         creatorId,
        ig_conversation_id: fakeIgUserId,
        ig_user_id:         fakeIgUserId,
        ig_username:        senderUsername,
        last_message_at:    now,
        status:             'new',
      },
      { onConflict: 'ig_conversation_id', ignoreDuplicates: false },
    )
    .select('id, unread_count')
    .single()

  if (convError || !conversation) {
    console.error('[test-webhook] failed to upsert conversation:', convError)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  // Increment unread_count atomically
  await admin.rpc('increment_dm_unread', { conv_id: conversation.id })

  // Insert message (generate a unique fake ig_message_id to allow multiple test messages)
  const fakeMessageId = `test_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const { data: message, error: msgError } = await admin
    .from('dm_messages')
    .insert({
      conversation_id:  conversation.id,
      ig_message_id:    fakeMessageId,
      direction:        'inbound',
      message_text:     messageText,
      sent_at:          now,
      is_internal_note: false,
    })
    .select('id')
    .single()

  if (msgError) {
    console.error('[test-webhook] failed to insert test message:', msgError)
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
  }

  console.log(`[test-webhook] created test message ${message.id} in conversation ${conversation.id}`)

  return NextResponse.json({
    ok:              true,
    conversation_id: conversation.id,
    message_id:      message.id,
    ig_user_id:      fakeIgUserId,
  })
}
