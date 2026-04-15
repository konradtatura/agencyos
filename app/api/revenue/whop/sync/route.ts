/**
 * POST /api/revenue/whop/sync
 *
 * Fetches paid payments from the Whop v1 payments API and upserts them
 * into the sales table, matching customer emails to CRM leads where possible.
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhopPayment {
  id:           string
  status:       string
  substatus?:   string | null
  reason?:      string | null   // "subscription_creation" | "subscription_renewal" | "one_time_payment"
  type?:        string | null   // may indicate charge type
  payment_type?: string | null  // may be "recurring" | "one_time"
  billing_type?: string | null
  membership_id?: string | null  // non-null = subscription charge
  membership?: {
    id?:              string | null
    renewal_period_type?: string | null   // 'monthly' | 'yearly'
    plan_id?:         string | null
  } | null
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
    id:             string
    billing_type?:  string | null
    interval?:      string | null
    renewal_period_duration?: number | null
    renewal_period_type?:     string | null
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

// ── Tier inference by amount (fallback when no product match) ─────────────────
// These are soft defaults — the creator can always edit the product's tier.
function inferTier(amount: number): 'ht' | 'mt' | 'lt' {
  if (amount >= 3000) return 'ht'
  if (amount >= 500)  return 'mt'
  return 'lt'
}

function normaliseName(s: string): string {
  return s.toLowerCase().trim()
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('creator_profiles')
    .select('whop_api_key_enc, whop_company_id')
    .eq('id', creatorId)
    .maybeSingle()

  if (!profile?.whop_api_key_enc) {
    return NextResponse.json({ error: 'Whop not connected' }, { status: 422 })
  }

  if (!profile?.whop_company_id) {
    return NextResponse.json({ error: 'Whop company ID not set' }, { status: 422 })
  }

  const apiKey    = decryptKey(profile.whop_api_key_enc)
  const companyId = profile.whop_company_id as string

  // Fetch payments and filter to paid/active (covers one-time + subscription renewals)
  const payments = await fetchAllPayments(apiKey, companyId)
  const paid = payments.filter(
    (p) =>
      p.status === 'paid' ||
      p.substatus === 'succeeded' ||
      p.substatus === 'active',   // subscription recurring charges
  )

  // ── Load existing products for matching ───────────────────────────────────
  const { data: existingProducts } = await admin
    .from('products')
    .select('id, name, tier, whop_product_id')
    .eq('creator_id', creatorId)

  // Two lookup maps: by Whop product ID and by normalised name
  const byWhopId   = new Map<string, { id: string; tier: string }>()
  const byName     = new Map<string, { id: string; tier: string }>()
  for (const prod of existingProducts ?? []) {
    if (prod.whop_product_id) byWhopId.set(prod.whop_product_id, prod)
    byName.set(normaliseName(prod.name), prod)
  }

  // Cache of Whop product ID → our product ID (populated as we create new ones)
  const whopProductToId = new Map<string, string>()

  // Pre-seed from existing products
  for (const prod of existingProducts ?? []) {
    if (prod.whop_product_id) whopProductToId.set(prod.whop_product_id, prod.id)
  }

  async function resolveProductId(
    whopProductId: string | undefined,
    title:         string | undefined,
    amount:        number,
    isRecurring:   boolean = false,
  ): Promise<string | null> {
    if (!whopProductId && !title) return null

    // 1. Already resolved this Whop product in this sync run
    if (whopProductId && whopProductToId.has(whopProductId)) {
      return whopProductToId.get(whopProductId)!
    }

    // 2. Match by Whop product ID
    if (whopProductId && byWhopId.has(whopProductId)) {
      const prod = byWhopId.get(whopProductId)!
      whopProductToId.set(whopProductId, prod.id)
      return prod.id
    }

    // 3. Match by normalised product name
    if (title) {
      const key = normaliseName(title)
      if (byName.has(key)) {
        const prod = byName.get(key)!
        // Back-fill whop_product_id on the existing product if it was missing
        if (whopProductId && !byWhopId.has(whopProductId)) {
          await admin.from('products')
            .update({ whop_product_id: whopProductId })
            .eq('id', prod.id)
          byWhopId.set(whopProductId, prod)
        }
        if (whopProductId) whopProductToId.set(whopProductId, prod.id)
        return prod.id
      }
    }

    // 4. Auto-create a new product with inferred tier
    if (!title) return null
    const tier = inferTier(amount)
    const { data: newProd, error } = await admin.from('products').insert({
      creator_id:      creatorId,
      name:            title.trim(),
      tier,
      payment_type:    isRecurring ? 'recurring' : 'onetime',
      price:           amount,
      whop_product_id: whopProductId ?? null,
      active:          true,
    }).select('id').single()

    if (error || !newProd) {
      console.error('[whop/sync] failed to create product:', title, error?.message)
      return null
    }

    console.log(`[whop/sync] auto-created product "${title}" → ${tier}`)
    const entry = { id: newProd.id, tier }
    byName.set(normaliseName(title), entry)
    if (whopProductId) {
      byWhopId.set(whopProductId, entry)
      whopProductToId.set(whopProductId, newProd.id)
    }
    return newProd.id
  }

  // ── Build email → lead_id map ─────────────────────────────────────────────
  const emails = Array.from(new Set(
    paid.map((p) => p.user?.email).filter(Boolean) as string[],
  ))

  const { data: matchedLeads } = emails.length
    ? await admin
        .from('leads')
        .select('id, email')
        .eq('creator_id', creatorId)
        .in('email', emails)
    : { data: [] }

  const emailToLeadId = new Map<string, string>()
  for (const lead of matchedLeads ?? []) {
    if (lead.email) emailToLeadId.set(lead.email as string, lead.id as string)
  }

  // ── Upsert sales ──────────────────────────────────────────────────────────
  let synced = 0

  // Dump first payment raw to understand Whop's actual field names
  if (paid.length > 0) {
    const sample = paid[0] as Record<string, unknown>
    console.log('[whop/sync] SAMPLE PAYMENT KEYS:', Object.keys(sample).join(', '))
    console.log('[whop/sync] SAMPLE PAYMENT:', JSON.stringify({
      id:           sample.id,
      status:       sample.status,
      substatus:    sample.substatus,
      reason:       sample.reason,
      type:         sample.type,
      payment_type: sample.payment_type,
      billing_type: sample.billing_type,
      membership_id: sample.membership_id,
      membership:   sample.membership,
      plan:         sample.plan,
      final_amount: sample.final_amount,
      subtotal:     sample.subtotal,
    }, null, 2))
  }

  for (const p of paid) {
    const email    = p.user?.email ?? null
    const leadId   = email ? (emailToLeadId.get(email) ?? null) : null
    const amount   = p.final_amount ?? p.subtotal ?? 0
    const saleDate = p.paid_at ? p.paid_at.slice(0, 10) : p.created_at.slice(0, 10)
    const currency = p.currency?.toUpperCase() ?? null
    // Detect recurring via every available Whop API signal:
    const reason       = (p.reason ?? '').toLowerCase()
    const pType        = (p.payment_type ?? p.type ?? '').toLowerCase()
    const planBilling  = p.plan?.billing_type ?? p.billing_type ?? ''
    const planInterval = p.plan?.interval ?? p.plan?.renewal_period_type ?? p.membership?.renewal_period_type ?? ''
    const hasMembership = !!(p.membership_id || p.membership?.id)

    const isRecurring =
      hasMembership ||                              // membership_id present = subscription charge
      reason.includes('subscription') ||            // reason field (Whop UI label in snake_case)
      pType === 'recurring' ||                      // explicit payment_type / type
      planBilling === 'recurring' ||                // plan.billing_type
      (planInterval !== '' && planInterval !== 'one_time')  // plan/membership interval

    if (isRecurring) console.log(`[whop/sync] recurring: id=${p.id} reason="${p.reason}" planBilling="${planBilling}" planInterval="${planInterval}"`)
    const productId = await resolveProductId(p.product?.id, p.product?.title, amount, isRecurring)

    const { error } = await admin.from('sales').upsert(
      {
        creator_id:    creatorId,
        lead_id:       leadId,
        product_id:    productId,
        product_name:  p.product?.title ?? null,
        amount,
        currency,
        platform:      'whop',
        payment_type:  isRecurring ? 'recurring' : 'upfront',
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
    .eq('id', creatorId)

  return NextResponse.json({ synced, total: paid.length })
}
