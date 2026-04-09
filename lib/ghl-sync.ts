/**
 * GHL Sync — push stage changes from AgencyOS to Go High Level.
 *
 * Reads GHL_API_KEY and GHL_BASE_URL from environment variables.
 * GHL_BASE_URL defaults to https://services.leadconnectorhq.com
 *
 * Strategy:
 *   1. Resolve the GHL contact ID for the lead (stored on leads.ghl_contact_id,
 *      or looked up by email via GHL contacts search if not yet stored).
 *   2. Add the mapped tag to the contact (PUT /contacts/:id/tags).
 *   3. Persist the resolved contact ID back to the lead row if it was missing.
 *
 * Tag mapping (AgencyOS stage → GHL tag):
 *   call_booked  → "Call Booked"
 *   showed       → "Showed"
 *   no_show      → "No Show"
 *   closed_won   → "Closed Won"
 *   closed_lost  → "Closed Lost"
 *
 * All failures are non-fatal — errors are logged and the function resolves
 * so the calling API route is never broken by a GHL outage.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Config ─────────────────────────────────────────────────────────────────

async function ghlConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
  const baseUrl = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('agency_config')
      .select('ghl_api_key')
      .limit(1)
      .maybeSingle()

    if (!data?.ghl_api_key) {
      console.warn('[ghl-sync] No GHL API key found in agency_config — skipping')
      return null
    }
    return { apiKey: data.ghl_api_key, baseUrl }
  } catch (err) {
    console.error('[ghl-sync] Failed to read GHL config from DB:', err)
    return null
  }
}

// ── Stage → tag map ────────────────────────────────────────────────────────

const STAGE_TAG_MAP: Record<string, string> = {
  call_booked:  'Call Booked',
  showed:       'Showed',
  no_show:      'No Show',
  closed_won:   'Closed Won',
  closed_lost:  'Closed Lost',
}

// ── GHL API helpers ────────────────────────────────────────────────────────

interface GhlContact {
  id: string
  email?: string
  tags?: string[]
}

interface GhlContactSearchResponse {
  contacts: GhlContact[]
}

/** Search GHL contacts by email, return first match or null. */
async function searchContactByEmail(
  email: string,
  apiKey: string,
  baseUrl: string,
): Promise<GhlContact | null> {
  try {
    const url = `${baseUrl}/contacts/?email=${encodeURIComponent(email)}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
    })
    if (!res.ok) {
      console.error(`[ghl-sync] contact search failed: ${res.status} ${await res.text()}`)
      return null
    }
    const data = (await res.json()) as GhlContactSearchResponse
    return data.contacts?.[0] ?? null
  } catch (err) {
    console.error('[ghl-sync] contact search error:', err)
    return null
  }
}

/** Add a tag to a GHL contact. */
async function addTagToContact(
  contactId: string,
  tag: string,
  apiKey: string,
  baseUrl: string,
): Promise<boolean> {
  try {
    const url = `${baseUrl}/contacts/${contactId}/tags`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      body: JSON.stringify({ tags: [tag] }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[ghl-sync] tag update failed for contact ${contactId}: ${res.status} ${body}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[ghl-sync] tag update error:', err)
    return false
  }
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Push a stage change for a lead to GHL by adding the corresponding tag.
 *
 * @param leadId  - AgencyOS lead UUID
 * @param newStage - The stage value being set (e.g. 'closed_won')
 */
export async function pushStageToGHL(leadId: string, newStage: string): Promise<void> {
  const cfg = await ghlConfig()
  if (!cfg) return

  const tag = STAGE_TAG_MAP[newStage]
  if (!tag) {
    // Stage not in the map (e.g. 'qualifying') — nothing to push
    return
  }

  const admin = createAdminClient()

  // 1. Fetch the lead
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, name, email, ghl_contact_id')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    console.error(`[ghl-sync] lead not found: ${leadId}`, leadErr?.message)
    return
  }

  let ghlContactId: string | null = lead.ghl_contact_id ?? null

  // 2. If no stored contact ID, try to find by email
  if (!ghlContactId) {
    if (!lead.email) {
      console.warn(`[ghl-sync] lead ${leadId} has no ghl_contact_id and no email — cannot look up GHL contact`)
      return
    }

    const contact = await searchContactByEmail(lead.email, cfg.apiKey, cfg.baseUrl)
    if (!contact) {
      console.warn(`[ghl-sync] no GHL contact found for email ${lead.email} (lead: ${leadId})`)
      return
    }

    ghlContactId = contact.id

    // 3. Persist the resolved contact ID so future syncs are faster
    const { error: updateErr } = await admin
      .from('leads')
      .update({ ghl_contact_id: ghlContactId })
      .eq('id', leadId)

    if (updateErr) {
      console.error(`[ghl-sync] failed to store ghl_contact_id on lead ${leadId}:`, updateErr.message)
      // Non-fatal — we still have the ID in memory for this call
    } else {
      console.log(`[ghl-sync] stored ghl_contact_id ${ghlContactId} on lead ${leadId}`)
    }
  }

  // 4. Push the tag
  const ok = await addTagToContact(ghlContactId, tag, cfg.apiKey, cfg.baseUrl)

  if (ok) {
    console.log(`[ghl-sync] ✓ tagged contact ${ghlContactId} with "${tag}" (lead: ${leadId}, stage: ${newStage})`)
  }
}
