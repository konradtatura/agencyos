import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Meta webhook payload types
// ---------------------------------------------------------------------------
interface IgMessage {
  mid: string
  text?: string
}

interface IgMessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: IgMessage
}

interface IgEntry {
  id: string
  time: number
  messaging?: IgMessagingEvent[]
}

interface IgWebhookPayload {
  object: string
  entry?: IgEntry[]
}

// ---------------------------------------------------------------------------
// GET — Meta webhook verification challenge
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[dm-webhook] verification challenge accepted')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[dm-webhook] verification failed — token mismatch or wrong mode')
  return new NextResponse('Forbidden', { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — incoming DM events
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Always return 200 immediately — Meta retries on any other status
  let payload: IgWebhookPayload
  try {
    payload = (await req.json()) as IgWebhookPayload
  } catch {
    console.error('[dm-webhook] failed to parse JSON body')
    return NextResponse.json({ ok: true })
  }

  if (payload.object !== 'instagram') {
    console.warn('[dm-webhook] unexpected object type:', payload.object)
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.message) continue

      const senderId    = event.sender.id
      const recipientId = event.recipient.id
      const messageId   = event.message.mid
      const messageText = event.message.text ?? null
      const sentAt      = new Date(event.timestamp).toISOString()

      // a) Find creator who owns this Instagram account
      const { data: igAccount } = await supabase
        .from('instagram_accounts')
        .select('creator_id')
        .eq('ig_user_id', recipientId)
        .maybeSingle()

      if (!igAccount?.creator_id) {
        console.warn(`[dm-webhook] no creator found for ig_user_id=${recipientId}, skipping`)
        continue
      }

      const creatorId = igAccount.creator_id
      console.log(`[dm-webhook] Received message from ${senderId} for creator ${creatorId}`)

      // b) Upsert dm_conversations — keyed on (creator_id, ig_conversation_id)
      const { data: conversation, error: convError } = await supabase
        .from('dm_conversations')
        .upsert(
          {
            creator_id:          creatorId,
            ig_conversation_id:  senderId,
            ig_user_id:          senderId,
            last_message_at:     new Date().toISOString(),
            // unread_count incremented below via raw SQL to avoid race conditions
          },
          {
            onConflict:     'ig_conversation_id',
            ignoreDuplicates: false,
          },
        )
        .select('id, unread_count')
        .single()

      if (convError || !conversation) {
        console.error('[dm-webhook] failed to upsert conversation:', convError)
        continue
      }

      // Increment unread_count separately so concurrent events don't clobber each other
      await supabase.rpc('increment_dm_unread', { conv_id: conversation.id })

      // c) Insert dm_messages — skip if ig_message_id already exists
      const { error: msgError } = await supabase
        .from('dm_messages')
        .insert({
          conversation_id:  conversation.id,
          ig_message_id:    messageId,
          direction:        'inbound',
          message_text:     messageText,
          sent_at:          sentAt,
          is_internal_note: false,
        })

      if (msgError) {
        // Unique constraint on ig_message_id — duplicate delivery from Meta, skip silently
        if (msgError.code === '23505') {
          console.log(`[dm-webhook] duplicate message ${messageId}, skipping`)
        } else {
          console.error('[dm-webhook] failed to insert message:', msgError)
        }
        continue
      }

      console.log(`[dm-webhook] saved message ${messageId} → conversation ${conversation.id}`)
    }
  }

  return NextResponse.json({ ok: true })
}
