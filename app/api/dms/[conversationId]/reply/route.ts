/**
 * POST /api/dms/[conversationId]/reply
 *
 * Sends a reply to the Instagram user, or saves an internal note.
 * Body: { text: string, isInternalNote?: boolean }
 */

import { NextResponse } from 'next/server'
import { resolveDmConversation } from '../../_auth'
import { decrypt } from '@/lib/encryption'

const IG_API = 'https://graph.facebook.com/v22.0'

export async function POST(
  req: Request,
  { params }: { params: { conversationId: string } },
) {
  const resolved = await resolveDmConversation(params.conversationId)
  if ('error' in resolved) return resolved.error

  const { admin, userId, conversation } = resolved

  let body: { text?: string; isInternalNote?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text           = body.text?.trim() ?? ''
  const isInternalNote = body.isInternalNote === true

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // ── Internal note: no Instagram API call needed ──────────────────────────────
  if (isInternalNote) {
    const { data: msg, error: insertError } = await admin
      .from('dm_messages')
      .insert({
        conversation_id:  conversation.id,
        direction:        'outbound',
        message_text:     text,
        sent_at:          now,
        sender_id:        userId,
        is_internal_note: true,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[dm-reply] failed to insert internal note:', insertError)
      return NextResponse.json({ error: 'Failed to save note' }, { status: 500 })
    }

    console.log(`[dm-reply] internal note saved → message ${msg.id}`)
    return NextResponse.json({ success: true, messageId: msg.id })
  }

  // ── Outbound message: send via Instagram Messaging API ───────────────────────

  // 1. Get the creator's Instagram access token + cached page_id
  const { data: integration, error: integError } = await admin
    .from('integrations')
    .select('access_token, status, meta')
    .eq('creator_id', conversation.creator_id)
    .eq('platform', 'instagram')
    .maybeSingle()

  if (integError || !integration?.access_token) {
    console.error('[dm-reply] no instagram integration for creator:', conversation.creator_id)
    return NextResponse.json(
      { error: 'Instagram account not connected for this creator' },
      { status: 422 },
    )
  }

  if (integration.status !== 'active') {
    return NextResponse.json(
      { error: 'Instagram token is expired or disconnected — reconnect in Settings' },
      { status: 422 },
    )
  }

  let accessToken: string
  try {
    accessToken = decrypt(integration.access_token)
  } catch {
    // Token may have been stored as plain text — fall back gracefully
    accessToken = integration.access_token
  }

  // 2. Resolve the Facebook Page ID (required for /{page_id}/messages endpoint)
  //    Check the cached value first; fetch from /me if absent.
  const meta = (integration.meta ?? {}) as Record<string, unknown>
  let pageId  = typeof meta.page_id === 'string' ? meta.page_id : null

  if (!pageId) {
    try {
      const meRes = await fetch(`${IG_API}/me?access_token=${accessToken}`)
      if (meRes.ok) {
        const meData = await meRes.json() as { id?: string; name?: string }
        pageId = meData.id ?? null
        if (pageId) {
          // Cache for all future calls — fire and forget
          admin
            .from('integrations')
            .update({ meta: { ...meta, page_id: pageId } })
            .eq('creator_id', conversation.creator_id)
            .eq('platform', 'instagram')
            .then(() => console.log(`[dm-reply] cached page_id=${pageId}`))
            .catch((err: unknown) => console.warn('[dm-reply] failed to cache page_id:', err))
        }
      } else {
        console.warn('[dm-reply] /me lookup failed:', await meRes.text())
      }
    } catch (err) {
      console.warn('[dm-reply] /me fetch error:', err)
    }
  }

  if (!pageId) {
    console.error('[dm-reply] could not resolve page_id for creator:', conversation.creator_id)
    return NextResponse.json(
      { error: 'Could not resolve Facebook Page ID — ensure the token is a Page Access Token' },
      { status: 422 },
    )
  }

  // 3. Call Instagram Messaging API via Page endpoint
  let igMessageId: string | null = null
  try {
    const igRes = await fetch(`${IG_API}/${pageId}/messages`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient:       { id: conversation.ig_user_id },
        message:         { text },
        messaging_type:  'RESPONSE',
      }),
    })

    if (!igRes.ok) {
      const errBody = await igRes.text()
      console.error('[dm-reply] Meta API error:', igRes.status, errBody)
      return NextResponse.json(
        { error: `Meta API error: ${igRes.status}` },
        { status: 502 },
      )
    }

    const igData = await igRes.json() as { message_id?: string }
    igMessageId = igData.message_id ?? null
    console.log(`[dm-reply] message sent via Meta API → ig_message_id=${igMessageId}`)
  } catch (err) {
    console.error('[dm-reply] network error calling Meta API:', err)
    return NextResponse.json({ error: 'Failed to reach Meta API' }, { status: 502 })
  }

  // 3. Persist the outbound message
  const { data: msg, error: insertError } = await admin
    .from('dm_messages')
    .insert({
      conversation_id:  conversation.id,
      ig_message_id:    igMessageId,
      direction:        'outbound',
      message_text:     text,
      sent_at:          now,
      sender_id:        userId,
      is_internal_note: false,
    })
    .select('id')
    .single()

  if (insertError) {
    // Don't fail the request — the message was sent, we just couldn't log it
    console.error('[dm-reply] failed to insert outbound message record:', insertError)
    return NextResponse.json({ success: true, messageId: igMessageId })
  }

  // 4. Update last_message_at on the conversation
  await admin
    .from('dm_conversations')
    .update({ last_message_at: now })
    .eq('id', conversation.id)

  return NextResponse.json({ success: true, messageId: msg.id })
}
