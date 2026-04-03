/**
 * Loads and decrypts the agency-level Tally API key from agency_settings.
 * Must be called from server-side code only (API routes).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { tallyDecrypt } from '@/lib/tally/encryption'

export async function getAgencyTallyKey(): Promise<string | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('agency_settings')
    .select('value')
    .eq('key', 'tally_api_key')
    .maybeSingle()

  if (!data?.value) return null

  try {
    return tallyDecrypt(data.value)
  } catch {
    console.error('[tally] failed to decrypt agency Tally key')
    return null
  }
}
