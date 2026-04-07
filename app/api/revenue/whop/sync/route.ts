/**
 * POST /api/revenue/whop/sync
 *
 * Pulls all Whop memberships for the creator, upserts into sales table,
 * upserts Whop products into products table, and tries to match customer
 * emails to existing CRM leads.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../../crm/_auth'
import { decrypt } from '@/lib/crypto'

// ── Whop API helpers ──────────────────────────────────────────────────────────

interface WhopMembership {
  id:          string
  status:      string
  plan_id:     string | null
  product_id:  string | null
  user: {
    id:       string
    username: string | null
    email:    string | null
  } | null
  price_cents:         number | null
  interval:            string | null
  renewal_period_start: string | null
  renewal_period_end:   string | null
  created_at:          string
  product: {
    id:   string
    name: string
  } | null
  plan: {
    id:          string
    name:        string
    price_cents: number | null
  } | null
}

interface WhopPaginatedResponse<T> {
  data:       T[]
  pagination: {
    current_page: number
    total_pages:  number
    next_page?:   number | null
  } | null
}

function decryptKey(enc: string): string {
  if (enc.startsWith('plain:')) return enc.slice(6)
  return decrypt(enc)
}

async function fetchAllMemberships(apiKey: string): Promise<WhopMembership[]> {
  const all: WhopMembership[] = []
  let page = 1
  let totalPages = 1

  do {
    const res = await fetch(
      `https://api.whop.com/api/v2/memberships?status=all&per_page=50&page=${page}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    if (!res.ok) {
      console.error('[whop/sync] memberships fetch failed:', res.status)
      break
    }
    const body = (await res.json()) as WhopPaginatedResponse<WhopMembership>
    all.push(...(body.data ?? []))
    totalPages = body.pagination?.total_pages ?? 1
    page++
  } while (page <= totalPages)

  return all
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error

  const { admin, creatorId, role } = auth
  if (!creatorId && role !== 'super_admin') {
    return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 })
  }

  // Fetch creator's encrypted Whop key
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('whop_api_key_enc')
    .eq('id', creatorId!)
    .maybeSingle()

  if (!profile?.whop_api_key_enc) {
    return NextResponse.json({ error: 'Whop not connected' }, { status: 422 })
  }

  let apiKey: string
  try {
    apiKey = decryptKey(profile.whop_api_key_enc)
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt Whop API key' }, { status: 500 })
  }

  // Fetch all memberships from Whop
  const memberships = await fetchAllMemberships(apiKey)

  // DEBUG — remove before shipping
  return NextResponse.json({ debug: true, raw: memberships })

  // Build email → lead_id map for matching
  const emails = memberships
    .map((m) => m.user?.email)
    .filter(Boolean) as string[]

  const { data: matchedLeads } = emails.length
    ? await admin
        .from('leads')
        .select('id, email')
        .eq('creator_id', creatorId!)
        .in('email', emails)
    : { data: [] }

  const emailToLeadId = new Map<string, string>()
  for (const lead of matchedLeads ?? []) {
    if (lead.email) emailToLeadId.set(lead.email as string, lead.id as string)
  }

  // Upsert products
  const productsToUpsert = Array.from(
    new Map(
      memberships
        .filter((m) => m.product?.id)
        .map((m) => [m.product!.id, m.product!]),
    ).values(),
  )

  for (const wp of productsToUpsert) {
    // Check if this Whop product is already linked
    const { data: existing } = await admin
      .from('products')
      .select('id')
      .eq('creator_id', creatorId!)
      .eq('whop_product_id', wp.id)
      .maybeSingle()

    if (!existing) {
      await admin.from('products').insert({
        creator_id:      creatorId!,
        name:            wp.name,
        tier:            'ht',           // default — user can adjust
        payment_type:    'recurring',
        price:           0,              // filled in after
        whop_product_id: wp.id,
        active:          true,
      })
    }
  }

  // Upsert sales (one per membership)
  let syncedCount = 0

  for (const m of memberships) {
    const amount = (m.price_cents ?? m.plan?.price_cents ?? 0) / 100
    const email  = m.user?.email ?? null
    const leadId = email ? (emailToLeadId.get(email) ?? null) : null

    // Find matching product
    const { data: matchedProduct } = m.product?.id
      ? await admin
          .from('products')
          .select('id, name')
          .eq('creator_id', creatorId!)
          .eq('whop_product_id', m.product.id)
          .maybeSingle()
      : { data: null }

    const saleDate = m.renewal_period_start
      ? m.renewal_period_start.slice(0, 10)
      : m.created_at.slice(0, 10)

    const { error } = await admin.from('sales').upsert(
      {
        creator_id:    creatorId!,
        lead_id:       leadId,
        product_id:    matchedProduct?.id ?? null,
        product_name:  matchedProduct?.name ?? m.product?.name ?? m.plan?.name ?? null,
        amount,
        platform:      'whop',
        payment_type:  m.interval ? 'recurring' : 'upfront',
        sale_date:     saleDate,
        whop_sale_id:  m.id,
      },
      { onConflict: 'whop_sale_id', ignoreDuplicates: false },
    )

    if (!error) syncedCount++
  }

  // Update last_synced_at
  await admin
    .from('creator_profiles')
    .update({ whop_last_synced_at: new Date().toISOString() })
    .eq('id', creatorId!)

  return NextResponse.json({ synced: syncedCount })
}
