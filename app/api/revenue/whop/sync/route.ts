/**
 * POST /api/revenue/whop/sync
 *
 * Fetches paid payments from the Whop v1 payments API and upserts them
 * into the sales table, matching customer emails to CRM leads where possible.
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '../../../crm/_auth'
import { decrypt } from '@/lib/crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhopPayment {
  id:         string
  status:     string
  substatus?: string | null
  paid_at:    string | null
  created_at: string
  final_amount?: number | null
  subtotal?:     number | null
  currency?:     string | null
  product?: {
    id:    string
    title: string
  } | null
  plan?: {
    id: string
  } | null
  user?: {
    email: string | null
    name:  string | null
  } | null
}

interface WhopPaymentsResponse {
  data:       WhopPayment[]
  meta?: {
    next_cursor?: string | null
    has_more?:    boolean
  } | null
  pagination?: {
    current_page: number
    total_pages:  number
  } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decryptKey(enc: string): string {
  if (enc.startsWith('plain:')) return enc.slice(6)
  try {
    return decrypt(enc)
  } catch {
    return enc
  }
}

async function fetchAllPayments(
  apiKey: string,
  companyId: string,
): Promise<WhopPayment[]> {
  const all: WhopPayment[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `https://api.whop.com/api/v1/payments?company_id=${encodeURIComponent(companyId)}&per_page=50&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) {
      console.error('[whop/sync] payments fetch failed:', res.status, await res.text())
      break
    }

    const body = (await res.json()) as WhopPaymentsResponse
    const batch = body.data ?? []
    all.push(...batch)

    // Support both cursor-based and page-based pagination
    if (body.meta?.has_more === false || body.meta?.has_more == null && !body.meta?.next_cursor) {
      hasMore = false
    } else if (body.pagination) {
      hasMore = page < (body.pagination.total_pages ?? 1)
    } else if (batch.length < 50) {
      hasMore = false
    }

    page++
  }

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

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('whop_api_key_enc, whop_company_id')
    .eq('id', creatorId!)
    .maybeSingle()

  if (!profile?.whop_api_key_enc) {
    return NextResponse.json({ error: 'Whop not connected' }, { status: 422 })
  }

  if (!profile?.whop_company_id) {
    return NextResponse.json({ error: 'Whop company ID not set' }, { status: 422 })
  }

  const apiKey    = decryptKey(profile.whop_api_key_enc)
  const companyId = profile.whop_company_id as string

  // Fetch payments and filter to paid only
  const payments = await fetchAllPayments(apiKey, companyId)
  const paid = payments.filter(
    (p) => p.status === 'paid' || p.substatus === 'succeeded',
  )

  // Build email → lead_id map
  const emails = [...new Set(
    paid.map((p) => p.user?.email).filter(Boolean) as string[],
  )]

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

  // Upsert sales
  let synced = 0

  for (const p of paid) {
    const email    = p.user?.email ?? null
    const leadId   = email ? (emailToLeadId.get(email) ?? null) : null
    const amount   = p.final_amount ?? p.subtotal ?? 0  // Whop returns full currency units, not cents
    const saleDate = p.paid_at ? p.paid_at.slice(0, 10) : p.created_at.slice(0, 10)
    const currency = p.currency?.toUpperCase() ?? null

    const { error } = await admin.from('sales').upsert(
      {
        creator_id:    creatorId!,
        lead_id:       leadId,
        product_name:  p.product?.title ?? null,
        amount,
        currency,
        platform:      'whop',
        payment_type:  'upfront',
        sale_date:     saleDate,
        whop_sale_id:  p.id,
      },
      { onConflict: 'whop_sale_id', ignoreDuplicates: false },
    )

    if (!error) synced++
    else console.error('[whop/sync] upsert error for', p.id, error.message)
  }

  // Update last_synced_at
  await admin
    .from('creator_profiles')
    .update({ whop_last_synced_at: new Date().toISOString() })
    .eq('id', creatorId!)

  return NextResponse.json({ synced, total: paid.length })
}
