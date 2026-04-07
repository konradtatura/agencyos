export interface Product {
  id: string
  creator_id: string
  name: string
  tier: 'ht' | 'mt' | 'lt'
  payment_type: 'onetime' | 'recurring' | 'plan'
  price: number
  whop_product_id: string | null
  active: boolean
  created_at: string
}

export interface Sale {
  id: string
  creator_id: string
  lead_id: string | null
  product_id: string | null
  product_name: string | null
  amount: number
  platform: 'whop' | 'stripe' | 'manual'
  payment_type: 'upfront' | 'instalment' | 'recurring'
  sale_date: string
  closer_id: string | null
  lead_source_type: string | null
  whop_sale_id: string | null
  stripe_charge_id: string | null
  notes: string | null
  created_at: string
}

export interface SaleWithRelations extends Sale {
  product?: { tier: string | null; name: string | null } | null
  closer?:  { full_name: string | null } | null
}

export interface RevenueSummary {
  period:       { from: string; to: string }
  cashCollected: number
  mrr:           number
  newMrr:        number
  avgDealValue:  number
  totalSales:    number
  byTier:    Array<{ tier: string;     total: number; count: number }>
  byPlatform: Array<{ platform: string; total: number; count: number }>
  byCloser:  Array<{ closer_id: string | null; closer_name: string | null; total: number; count: number; avg: number }>
  bySource:  Array<{ source: string; total: number; count: number }>
  monthly:   Array<{ month: string; ht: number; mt: number; lt: number; total: number }>
}
