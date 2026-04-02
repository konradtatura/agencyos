/**
 * Reel transcription service — Sprint 4.
 *
 * transcribeReel(postId, mediaUrl)
 *   1. Downloads the video from Instagram's media_url
 *   2. Sends the audio to OpenAI Whisper (model: whisper-1)
 *   3. Stores the result in post_transcripts and sets transcript_status = 'done'
 *
 * On any failure the transcript_status is reset to 'none' and
 * { success: false, error } is returned so the caller can surface it.
 *
 * Server-side only — never import in client-side code.
 */

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoGroupReel } from '@/lib/auto-group-reels'

// ── Whisper config ────────────────────────────────────────────────────────────

const WHISPER_MODEL = 'whisper-1'

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
  return new OpenAI({ apiKey })
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TranscribeResult {
  success:     true
  transcript:  string
}

export interface TranscribeError {
  success: false
  error:   string
}

export type TranscribeOutcome = TranscribeResult | TranscribeError

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Instagram CDN URLs expire quickly — download once and hold in memory. */
async function downloadVideoAsFile(url: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Video download failed: HTTP ${res.status} from ${url}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const buffer      = Buffer.from(arrayBuffer)

  // Whisper accepts mp4 — Instagram media_urls are mp4 for reels
  return new File([buffer], 'reel.mp4', { type: 'video/mp4' })
}

// ── Core function ─────────────────────────────────────────────────────────────

export async function transcribeReel(
  postId:   string,
  mediaUrl: string,
): Promise<TranscribeOutcome> {
  const admin = createAdminClient()

  let videoFile: File

  try {
    videoFile = await downloadVideoAsFile(mediaUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[whisper] video download failed', { postId, error: message })

    await admin
      .from('instagram_posts')
      .update({ transcript_status: 'none' })
      .eq('id', postId)

    return { success: false, error: message }
  }

  let transcript: string

  try {
    const openai = getOpenAI()
    const response = await openai.audio.transcriptions.create({
      model: WHISPER_MODEL,
      file:  videoFile,
    })
    transcript = response.text
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[whisper] transcription failed', { postId, error: message })

    await admin
      .from('instagram_posts')
      .update({ transcript_status: 'none' })
      .eq('id', postId)

    return { success: false, error: message }
  }

  // Persist the transcript
  const { error: insertError } = await admin
    .from('post_transcripts')
    .insert({
      post_id:         postId,
      transcript_text: transcript,
      whisper_model:   WHISPER_MODEL,
    })

  if (insertError) {
    console.error('[whisper] transcript insert failed', { postId, error: insertError.message })

    await admin
      .from('instagram_posts')
      .update({ transcript_status: 'none' })
      .eq('id', postId)

    return { success: false, error: insertError.message }
  }

  // Mark done
  await admin
    .from('instagram_posts')
    .update({ transcript_status: 'done' })
    .eq('id', postId)

  // Auto-group by transcript similarity (fire-and-forget; never block the response)
  const { data: postMeta } = await admin
    .from('instagram_posts')
    .select('creator_id')
    .eq('id', postId)
    .single()

  if (postMeta?.creator_id) {
    autoGroupReel(postId, postMeta.creator_id).catch((err) => {
      console.error('[whisper] auto-group failed', { postId, error: err })
    })
  }

  return { success: true, transcript }
}
