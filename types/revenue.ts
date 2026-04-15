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
  // payment plan fields
  total_contract_value: number | null
  cash_collected_upfront: number | null
  amount_owed: number | null
  instalment_count: number | null
  expected_payoff_date: string | null
  program_status: 'active' | 'finished' | 'discontinued' | 'refund_requested' | 'refund_issued' | null
}

export interface SaleWithRelations extends Sale {
  product?: { tier: string | null; name: string | null } | null
  closer?:  { full_name: string | null } | null
  lead?:    { name: string | null } | null
}

export interface RevenueSummary {
  period:       { from: string; to: string }
  cashCollected: number
  netRevenue:    number   // cashCollected minus platform fees (3% for Whop)
  mrr:           number
  arr:           number   // mrr × 12
  newMrr:        number
  avgDealValue:  number
  totalSales:    number
  // Previous-period values for delta badges
  prevCashCollected: number
  prevNetRevenue:    number
  prevMrr:           number
  // Daily breakdown for sparkline charts
  daily: Array<{ date: string; gross: number; net: number; recurring: number }>
  byTier:    Array<{ tier: string;     total: number; count: number }>
  byPlatform: Array<{ platform: string; total: number; count: number }>
  byCloser:  Array<{ closer_id: string | null; closer_name: string | null; total: number; count: number; avg: number }>
  bySource:  Array<{ source: string; total: number; count: number }>
  monthly:   Array<{ month: string; ht: number; mt: number; lt: number; total: number }>
}

export interface PaymentInstalment {
  id: string
  sale_id: string
  creator_id: string
  instalment_number: number
  amount: number
  due_date: string
  paid_date: string | null
  status: 'pending' | 'paid' | 'overdue'
  created_at: string
}

export interface PaymentInstalmentWithRelations extends PaymentInstalment {
  sale?: {
    product_name: string | null
    closer_id: string | null
    lead?: { name: string | null } | null
    closer?: { full_name: string | null } | null
  } | null
}

export interface PostCallNote {
  id: string
  creator_id: string
  lead_id: string | null
  sale_id: string | null
  closer_id: string | null
  setter_id: string | null
  call_date: string | null
  appointment_source: 'story' | 'reel' | 'organic' | 'ads' | 'referral' | null
  call_outcome: 'closed' | 'no_show' | 'follow_up' | 'disqualified' | 'rescheduled' | null
  offer_pitched: string | null
  initial_payment_platform: string | null
  cash_collected_upfront: number | null
  amount_owed: number | null
  expected_payoff_date: string | null
  instalment_count: number | null
  prospect_notes: string | null
  crm_updated: boolean | null
  program_status: 'active' | 'finished' | 'discontinued' | 'refund_requested' | 'refund_issued' | null
  created_at: string
}

export interface Expense {
  id: string
  creator_id: string
  category: 'vendor' | 'sales_team' | 'ad_spend' | 'other'
  description: string | null
  amount: number
  date: string
  platform: string | null
  notes: string | null
  created_at: string
}

export interface FunnelSnapshot {
  id: string
  creator_id: string
  funnel_name: string
  date_from: string | null
  date_to: string | null
  meta_spend: number
  meta_impressions: number
  meta_clicks: number
  lp_views: number
  opt_ins: number
  application_views: number
  applications: number
  book_call_views: number
  calls_booked_paid: number
  calls_booked_crm: number
  downsell1_name: string | null
  downsell1_views: number
  downsell1_buyers: number
  downsell1_revenue: number
  downsell2_name: string | null
  downsell2_views: number
  downsell2_buyers: number
  downsell2_revenue: number
  total_revenue: number
  notes: string | null
  created_at: string
}

export interface RoasMetrics {
  booked_calls: number
  total_revenue: number
  avg_cpbc: number
  net_revenue: number
  total_roas: number
  aov: number
  total_ad_spend: number
  total_conversions: number
  avg_cpa: number
  total_expenses: number
}
