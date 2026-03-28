/**
 * Instagram token utilities.
 * Always use the admin client here — this runs in API routes / server components only.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/encryption'

/** Number of days before expiry at which we consider a token "expiring soon". */
const EXPIRY_WARNING_DAYS = 7

export interface InstagramIntegration {
  id:           string
  access_token: string | null
  expires_at:   string | null
  status:       string
  meta:         { ig_user_id?: string; username?: string }
}

/**
 * Fetches the Instagram integration row for a creator, decrypts the token,
 * and returns both the plaintext token and the raw integration row.
 * Returns null if no integration exists or decryption fails.
 */
export async function getInstagramToken(creatorId: string): Promise<{
  token:       string
  integration: InstagramIntegration
} | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('integrations')
    .select('id, access_token, expires_at, status, meta')
    .eq('creator_id', creatorId)
    .eq('platform', 'instagram')
    .single()

  if (error || !data?.access_token) return null

  try {
    const token = decrypt(data.access_token)
    return { token, integration: data as InstagramIntegration }
  } catch {
    // Decryption failed — token was inserted as plain text (e.g. manually via SQL).
    // Use it as-is so both encrypted and plain-text tokens work.
    console.warn(`[instagram] Token for creator ${creatorId} is not encrypted — using as plain text`)
    return { token: data.access_token, integration: data as InstagramIntegration }
  }
}

/**
 * Returns true if the token has already expired or will expire within
 * EXPIRY_WARNING_DAYS days. Treats a missing expires_at as already expired.
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true
  const threshold = new Date()
  threshold.setDate(threshold.getDate() + EXPIRY_WARNING_DAYS)
  return new Date(expiresAt) <= threshold
}
