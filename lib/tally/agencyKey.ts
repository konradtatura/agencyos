/**
 * Loads and decrypts the agency-level Tally API key from agency_settings.
 * Must be called from server-side code only (API routes).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { tallyDecrypt } from '@/lib/tally/encryption'

export async function getAgencyTallyKey(): Promise<string | null> {
  const admin = createAdminClient()

  const { data, error: dbError } = await admin
    .from('agency_settings')
    .select('value')
    .eq('key', 'tally_api_key')
    .maybeSingle()

  if (dbError) {
    console.error('[agencyKey] DB error reading agency_settings:', dbError.message, dbError.code)
    return null
  }

  if (!data?.value) {
    console.warn('[agencyKey] no row found for key=tally_api_key in agency_settings')
    return null
  }

  console.log('[agencyKey] encrypted value found, length:', data.value.length)

  try {
    const decrypted = tallyDecrypt(data.value)
    // Log a safe prefix so we can confirm the correct key was recovered
    console.log('[agencyKey] decrypted key prefix:', decrypted.slice(0, 8) + '…')
    return decrypted
  } catch (err) {
    console.error('[agencyKey] decryption failed — TALLY_ENCRYPTION_KEY may be wrong or rotated:', err)
    return null
  }
}
