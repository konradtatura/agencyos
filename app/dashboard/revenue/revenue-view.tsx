'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, CartesianGrid,
} from 'recharts'
import { Plus, Pencil, Trash2, RefreshCw, TrendingUp, DollarSign, ShoppingCart, BarChart2, ArrowRight } from 'lucide-react'
import type { RevenueSummary, Sale, SaleWithRelations, Product } from '@/types/revenue'
import DateRangePicker from '@/components/ui/date-range-picker'

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const CARD = {
  backgroundColor: '#111827',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 20,
} as const

const TIER_COLORS: Record<string, string> = { ht: '#a78bfa', mt: '#60a5fa', lt: '#34d399' }
const TIER_LABELS: Record<string, string> = { ht: 'High-ticket', mt: 'Mid-ticket', lt: 'Low-ticket' }
const PLATFORM_COLORS: Record<string, string> = { whop: '#a78bfa', stripe: '#60a5fa', manual: '#6b7280' }

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div style={CARD}>
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">{label}</p>
          <p className="text-[26px] font-bold text-[#f9fafb]">{value}</p>
          {sub && <p className="mt-0.5 text-[12px] text-[#4b5563]">{sub}</p>}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}22` }}
        >
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
      </div>
    </div>
  )
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px' }}>
      <p className="mb-1 text-[11px] text-[#9ca3af]">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-[12px]" style={{ color: p.fill ?? p.color }}>
          {p.name}: {fmtUSD(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── Sale modal ─────────────────────────────────────────────────────────────────

interface SaleFormState {
  product_id:       string
  product_name:     string
  amount:           string
  payment_type:     string
  sale_date:        string
  closer_id:        string
  lead_source_type: string
  notes:            string
}

const BLANK_SALE: SaleFormState = {
  product_id: '', product_name: '', amount: '', payment_type: 'upfront',
  sale_date: new Date().toISOString().slice(0, 10),
  closer_id: '', lead_source_type: '', notes: '',
}

function SaleModal({
  sale, products, onClose, onSaved,
}: {
  sale?: SaleWithRelations | null
  products: Product[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<SaleFormState>(
    sale
      ? {
          product_id:       sale.product_id       ?? '',
          product_name:     sale.product_name      ?? '',
          amount:           String(sale.amount),
          payment_type:     sale.payment_type,
          sale_date:        sale.sale_date,
          closer_id:        sale.closer_id         ?? '',
          lead_source_type: sale.lead_source_type  ?? '',
          notes:            sale.notes             ?? '',
        }
      : BLANK_SALE
  )
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  const set = (k: keyof SaleFormState, v: string) => setForm((p) => ({ ...p, [k]: v }))

  async function submit() {
    setSaving(true); setErr(null)
    const body = {
      ...form,
      amount:     parseFloat(form.amount),
      product_id: form.product_id || undefined,
      closer_id:  form.closer_id  || undefined,
      lead_source_type: form.lead_source_type || undefined,
      notes:      form.notes || undefined,
    }
    const url    = sale ? `/api/revenue/sales/${sale.id}` : '/api/revenue/sales'
    const method = sale ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="mb-5 text-[15px] font-semibold text-[#f9fafb]">
          {sale ? 'Edit Sale' : 'Add Sale'}
        </h2>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Product</span>
            <select
              value={form.product_id}
              onChange={(e) => {
                const pid = e.target.value
                const prod = products.find((p) => p.id === pid)
                set('product_id', pid)
                if (prod) set('product_name', prod.name)
              }}
              className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <option value="">— manual —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          {!form.product_id && (
            <label className="block">
              <span className="mb-1 block text-[11px] text-[#6b7280]">Product name (manual)</span>
              <input
                value={form.product_name}
                onChange={(e) => set('product_name', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
                style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-[#6b7280]">Amount (USD) *</span>
              <input
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
                style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] text-[#6b7280]">Payment type *</span>
              <select
                value={form.payment_type}
                onChange={(e) => set('payment_type', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
                style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="upfront">Upfront</option>
                <option value="instalment">Instalment</option>
                <option value="recurring">Recurring</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Sale date</span>
            <input
              type="date"
              value={form.sale_date}
              onChange={(e) => set('sale_date', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Lead source</span>
            <input
              value={form.lead_source_type}
              onChange={(e) => set('lead_source_type', e.target.value)}
              placeholder="e.g. organic, ads, referral"
              className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </label>
        </div>

        {err && <p className="mt-3 text-[12px] text-[#f87171]">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] text-[#9ca3af] hover:text-[#f9fafb]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#2563eb' }}
          >
            {saving ? 'Saving…' : sale ? 'Update' : 'Add Sale'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Product modal ──────────────────────────────────────────────────────────────

interface ProductFormState {
  name: string; tier: string; payment_type: string
  price: string; whop_product_id: string; active: boolean
}

const BLANK_PRODUCT: ProductFormState = {
  name: '', tier: 'ht', payment_type: 'onetime', price: '', whop_product_id: '', active: true,
}

function ProductModal({
  product, onClose, onSaved,
}: {
  product?: Product | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProductFormState>(
    product
      ? {
          name:            product.name,
          tier:            product.tier,
          payment_type:    product.payment_type,
          price:           String(product.price),
          whop_product_id: product.whop_product_id ?? '',
          active:          product.active,
        }
      : BLANK_PRODUCT
  )
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  const set = <K extends keyof ProductFormState>(k: K, v: ProductFormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  async function submit() {
    setSaving(true); setErr(null)
    const body = {
      ...form,
      price: parseFloat(form.price) || 0,
      whop_product_id: form.whop_product_id || undefined,
    }
    const url    = product ? `/api/revenue/products/${product.id}` : '/api/revenue/products'
    const method = product ? 'PATCH' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Save failed'); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="mb-5 text-[15px] font-semibold text-[#f9fafb]">
          {product ? 'Edit Product' : 'Add Product'}
        </h2>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Name *</span>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-[#6b7280]">Tier *</span>
              <select
                value={form.tier}
                onChange={(e) => set('tier', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
                style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="ht">High-ticket</option>
                <option value="mt">Mid-ticket</option>
                <option value="lt">Low-ticket</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] text-[#6b7280]">Payment type *</span>
              <select
                value={form.payment_type}
                onChange={(e) => set('payment_type', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
                style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="onetime">One-time</option>
                <option value="recurring">Recurring</option>
                <option value="plan">Plan</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Price (USD)</span>
            <input
              type="number" min="0" step="0.01"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#6b7280]">Whop product ID</span>
            <input
              value={form.whop_product_id}
              onChange={(e) => set('whop_product_id', e.target.value)}
              placeholder="optional"
              className="w-full rounded-lg px-3 py-2 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
              style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </label>

          {product && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set('active', e.target.checked)}
                className="rounded"
              />
              <span className="text-[13px] text-[#d1d5db]">Active</span>
            </label>
          )}
        </div>

        {err && <p className="mt-3 text-[12px] text-[#f87171]">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] text-[#9ca3af] hover:text-[#f9fafb]">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#2563eb' }}
          >
            {saving ? 'Saving…' : product ? 'Update' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Revenue Snapshot Banner ────────────────────────────────────────────────────

const MONO = "'JetBrains Mono', 'Fira Code', monospace"

function SnapshotStat({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}
      >
        {label}
      </span>
      <span
        className="text-[22px] font-bold leading-none truncate"
        style={{ color: accent ?? '#f9fafb', fontFamily: MONO }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

function RevenueSnapshotBanner({
  summary,
  loading,
  range,
  customFrom,
  customTo,
}: {
  summary: RevenueSummary | null
  loading: boolean
  range: Range
  customFrom?: string
  customTo?: string
}) {
  const s = summary

  const rangeLabel =
    range === 'today' ? 'Today' :
    range === '7d'    ? 'Last 7 days' :
    range === '30d'   ? 'Last 30 days' :
    range === 'month' ? 'This month' :
    range === 'all'   ? 'All time' :
    customFrom && customTo ? `${customFrom} → ${customTo}` : 'Custom'

  const gross = s?.cashCollected ?? 0
  const net   = s?.netRevenue    ?? 0
  const mrr   = s?.mrr           ?? 0
  const arr   = s?.arr           ?? 0
  const sales = s?.totalSales    ?? 0
  const saved = gross - net  // platform fees deducted

  return (
    <div
      className="mb-6 rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0d1117 0%, #111827 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-semibold text-[#9ca3af] tracking-wide">
            Revenue Snapshot
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
          >
            {rangeLabel}
          </span>
        </div>
        {saved > 0 && !loading && (
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {fmtUSD(saved)} in Whop fees (–3%)
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-5">
        {[
          {
            label: 'Gross Revenue',
            value: loading ? '—' : fmtUSD(gross),
            sub: 'total collected',
          },
          {
            label: 'Net Revenue',
            value: loading ? '—' : fmtUSD(net),
            sub: 'after platform fees',
            accent: '#34d399',
          },
          {
            label: 'MRR',
            value: loading ? '—' : fmtUSD(mrr),
            sub: 'recurring / mo',
            accent: '#60a5fa',
          },
          {
            label: 'ARR',
            value: loading ? '—' : fmtUSD(arr),
            sub: 'annualised run rate',
            accent: '#a78bfa',
          },
          {
            label: 'Sales',
            value: loading ? '—' : String(sales),
            sub: 'transactions',
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="px-5 py-4"
            style={{
              borderRight: i < 4 ? '1px solid rgba(255,255,255,0.05)' : undefined,
            }}
          >
            <SnapshotStat {...stat} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────────

interface OverviewExtras {
  allTimeTiers:  Array<{ tier: string; total: number }>
  monthTiers:    Array<{ tier: string; total: number }>
  allTimeExpenses: number
  monthExpenses:   number
  outstandingAmt:  number
}

function OverviewTab({ summary, loading, error, range, customFrom, customTo, onRangeChange, extras }: {
  summary: RevenueSummary | null
  loading: boolean
  error:   string | null
  range: Range
  customFrom?: string
  customTo?: string
  onRangeChange: (v: { range: Range; from?: string; to?: string }) => void
  extras: OverviewExtras
}) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-[#4b5563]">
        Loading…
      </div>
    )
  }

  if (!summary) return null

  if (error) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-[13px] text-[#fca5a5]"
        style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
      >
        {error}
      </div>
    )
  }

  const { cashCollected, mrr, avgDealValue, totalSales, byTier, byPlatform, byCloser, bySource, monthly } = summary

  const tierData  = byTier.filter((t) => t.total > 0)
  const platData  = byPlatform.filter((p) => p.total > 0)

  // All-time tier helpers
  const tierAmt = (tiers: Array<{ tier: string; total: number }>, t: string) =>
    tiers.find(x => x.tier === t)?.total ?? 0

  const allTimeGross = extras.allTimeTiers.reduce((s, t) => s + t.total, 0)
  const monthGross   = extras.monthTiers.reduce((s, t) => s + t.total, 0)
  const monthNetProfit = monthGross - extras.monthExpenses

  return (
    <div className="space-y-6">
      {/* ── All-Time Totals ────────────────────────────────────────────── */}
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">All-Time Totals</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="LT Cash"        value={fmtUSD(tierAmt(extras.allTimeTiers, 'lt'))} icon={DollarSign} color="#34d399" />
          <StatCard label="MT Cash"        value={fmtUSD(tierAmt(extras.allTimeTiers, 'mt'))} icon={DollarSign} color="#60a5fa" />
          <StatCard label="HT Cash"        value={fmtUSD(tierAmt(extras.allTimeTiers, 'ht'))} icon={DollarSign} color="#a78bfa" />
          <StatCard label="Total Expenses" value={fmtUSD(extras.allTimeExpenses)} icon={BarChart2} color="#f87171" />
          <StatCard label="Gross Collected" value={fmtUSD(allTimeGross)} icon={TrendingUp} color="#fbbf24" />
        </div>
      </div>

      {/* ── Monthly P&L ───────────────────────────────────────────────── */}
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">This Month</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <StatCard label="LT Cash"        value={fmtUSD(tierAmt(extras.monthTiers, 'lt'))} icon={DollarSign} color="#34d399" />
          <StatCard label="MT Cash"        value={fmtUSD(tierAmt(extras.monthTiers, 'mt'))} icon={DollarSign} color="#60a5fa" />
          <StatCard label="HT Cash"        value={fmtUSD(tierAmt(extras.monthTiers, 'ht'))} icon={DollarSign} color="#a78bfa" />
          <StatCard label="Expenses"       value={fmtUSD(extras.monthExpenses)} icon={BarChart2} color="#f87171" />
          <StatCard label="Gross Cash"     value={fmtUSD(monthGross)} icon={TrendingUp} color="#fbbf24" />
          <div style={{ ...CARD, borderColor: monthNetProfit >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">Net Profit</p>
            <p className="text-[26px] font-bold" style={{ color: monthNetProfit >= 0 ? '#34d399' : '#f87171' }}>
              {fmtUSD(monthNetProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Outstanding Instalments ────────────────────────────────────── */}
      {extras.outstandingAmt > 0 && (
        <Link
          href="/dashboard/revenue/outstanding"
          className="flex items-center justify-between rounded-xl px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
          style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <div>
            <p className="text-[12.5px] font-semibold text-[#fbbf24]">Outstanding Instalments</p>
            <p className="text-[12px] text-[#9ca3af]">{fmtUSD(extras.outstandingAmt)} owed across active payment plans</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#fbbf24]" />
        </Link>
      )}

      {/* Range picker */}
      <DateRangePicker
        value={{ range, from: customFrom, to: customTo }}
        onChange={onRangeChange}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Cash Collected" value={fmtUSD(cashCollected)} icon={DollarSign} color="#34d399" />
        <StatCard label="MRR" value={fmtUSD(mrr)} sub="recurring only" icon={TrendingUp} color="#60a5fa" />
        <StatCard label="Avg Deal" value={fmtUSD(avgDealValue)} icon={BarChart2} color="#a78bfa" />
        <StatCard label="Total Sales" value={String(totalSales)} icon={ShoppingCart} color="#fbbf24" />
      </div>

      {/* Monthly stacked bar */}
      <div style={CARD}>
        <p className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-[#6b7280]">
          Monthly Revenue by Tier
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} barSize={18} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend
              formatter={(v: string) => TIER_LABELS[v] ?? v}
              wrapperStyle={{ fontSize: 12, color: '#9ca3af' }}
            />
            <Bar dataKey="ht" name="ht" stackId="a" fill={TIER_COLORS.ht} radius={[0, 0, 0, 0]} />
            <Bar dataKey="mt" name="mt" stackId="a" fill={TIER_COLORS.mt} radius={[0, 0, 0, 0]} />
            <Bar dataKey="lt" name="lt" stackId="a" fill={TIER_COLORS.lt} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: platform pie + closer table + source table */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Platform donut */}
        <div style={CARD}>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#6b7280]">By Platform</p>
          {platData.length === 0 ? (
            <p className="text-[12px] text-[#4b5563]">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={platData}
                  dataKey="total"
                  nameKey="platform"
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={65}
                >
                  {platData.map((entry) => (
                    <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] ?? '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: unknown) => fmtUSD(v as number)}
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend
                  formatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                  wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Closer leaderboard */}
        <div style={CARD}>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#6b7280]">Closer Leaderboard</p>
          {byCloser.length === 0 ? (
            <p className="text-[12px] text-[#4b5563]">No data</p>
          ) : (
            <div className="space-y-2">
              {byCloser.slice(0, 5).map((c) => (
                <div key={c.closer_id ?? '__none__'} className="flex items-center justify-between">
                  <span className="truncate text-[12px] text-[#d1d5db]">
                    {c.closer_name ?? 'Unassigned'}
                  </span>
                  <div className="ml-2 text-right shrink-0">
                    <span className="text-[12px] font-semibold text-[#f9fafb]">{fmtUSD(c.total)}</span>
                    <span className="ml-1.5 text-[11px] text-[#6b7280]">({c.count})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source breakdown */}
        <div style={CARD}>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#6b7280]">By Source</p>
          {bySource.length === 0 ? (
            <p className="text-[12px] text-[#4b5563]">No data</p>
          ) : (
            <div className="space-y-2">
              {bySource.sort((a, b) => b.total - a.total).slice(0, 6).map((s) => (
                <div key={s.source} className="flex items-center justify-between">
                  <span className="truncate text-[12px] text-[#d1d5db] capitalize">{s.source}</span>
                  <div className="ml-2 text-right shrink-0">
                    <span className="text-[12px] font-semibold text-[#f9fafb]">{fmtUSD(s.total)}</span>
                    <span className="ml-1.5 text-[11px] text-[#6b7280]">({s.count})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tier pie */}
      {tierData.length > 0 && (
        <div style={CARD}>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#6b7280]">Revenue by Tier</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={tierData} layout="vertical" barSize={18}>
              <XAxis type="number" hide />
              <YAxis
                type="category" dataKey="tier" width={90}
                tick={{ fontSize: 12, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v: string) => TIER_LABELS[v] ?? v}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="total" name="Revenue" radius={[0, 4, 4, 0]}>
                {tierData.map((entry) => (
                  <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Sales tab ──────────────────────────────────────────────────────────────────

function SalesTab({ products }: { products: Product[] }) {
  const [sales,      setSales]      = useState<SaleWithRelations[]>([])
  const [loading,    setLoading]    = useState(true)
  const [range,      setRange]      = useState<Range>('30d')
  const [customFrom, setCustomFrom] = useState<string | undefined>()
  const [customTo,   setCustomTo]   = useState<string | undefined>()
  const [platform,   setPlatform]   = useState('')
  const [editSale,   setEditSale]   = useState<SaleWithRelations | null | undefined>(undefined)
  const [deleting,   setDeleting]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ range })
    if (range === 'custom' && customFrom) params.set('from', customFrom)
    if (range === 'custom' && customTo)   params.set('to', customTo)
    if (platform) params.set('platform', platform)
    const res  = await fetch(`/api/revenue/sales?${params}`)
    const data = await res.json()
    setSales(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [range, customFrom, customTo, platform])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Delete this sale?')) return
    setDeleting(id)
    await fetch(`/api/revenue/sales/${id}`, { method: 'DELETE' })
    setDeleting(null)
    load()
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          value={{ range, from: customFrom, to: customTo }}
          onChange={(v) => {
            setRange(v.range as Range)
            setCustomFrom(v.from)
            setCustomTo(v.to)
          }}
        />

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-[12.5px] text-[#d1d5db] outline-none"
          style={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <option value="">All platforms</option>
          <option value="whop">Whop</option>
          <option value="stripe">Stripe</option>
          <option value="manual">Manual</option>
        </select>

        <button
          onClick={() => setEditSale(null)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: '#2563eb' }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Sale
        </button>
      </div>

      {/* Table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Date', 'Product', 'Amount', 'Type', 'Platform', 'Source', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[#4b5563]">Loading…</td></tr>
            )}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[#4b5563]">No sales found</td></tr>
            )}
            {sales.map((s) => (
              <tr
                key={s.id}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                className="hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-4 py-3 text-[#9ca3af]">{fmtDate(s.sale_date)}</td>
                <td className="px-4 py-3 text-[#d1d5db]">{s.product_name ?? '—'}</td>
                <td className="px-4 py-3 font-semibold text-[#f9fafb]">{fmtUSD(s.amount)}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
                  >
                    {s.payment_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
                    style={{
                      backgroundColor: `${PLATFORM_COLORS[s.platform] ?? '#6b7280'}22`,
                      color:           PLATFORM_COLORS[s.platform] ?? '#6b7280',
                    }}
                  >
                    {s.platform}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#6b7280] capitalize">{s.lead_source_type ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditSale(s)} className="text-[#4b5563] hover:text-[#9ca3af]">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deleting === s.id}
                      className="text-[#4b5563] hover:text-[#f87171] disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editSale !== undefined && (
        <SaleModal
          sale={editSale}
          products={products}
          onClose={() => setEditSale(undefined)}
          onSaved={() => { setEditSale(undefined); load() }}
        />
      )}
    </div>
  )
}

// ── Products tab ───────────────────────────────────────────────────────────────

function ProductsTab() {
  const [products,   setProducts]   = useState<Product[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editProd,   setEditProd]   = useState<Product | null | undefined>(undefined)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/revenue/products')
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return
    setDeleting(id); setDeleteErr(null)
    const res  = await fetch(`/api/revenue/products/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(null)
    if (!res.ok) { setDeleteErr(json.error ?? 'Delete failed'); return }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditProd(null)}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ backgroundColor: '#2563eb' }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Product
        </button>
      </div>

      {deleteErr && <p className="text-[12px] text-[#f87171]">{deleteErr}</p>}

      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Name', 'Tier', 'Type', 'Price', 'Whop ID', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#6b7280]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[#4b5563]">Loading…</td></tr>
            )}
            {!loading && products.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-[#4b5563]">No products yet</td></tr>
            )}
            {products.map((p) => (
              <tr
                key={p.id}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                className="hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-4 py-3 font-medium text-[#f9fafb]">{p.name}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase"
                    style={{ backgroundColor: `${TIER_COLORS[p.tier] ?? '#6b7280'}22`, color: TIER_COLORS[p.tier] ?? '#6b7280' }}
                  >
                    {p.tier}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize text-[#9ca3af]">{p.payment_type}</td>
                <td className="px-4 py-3 text-[#d1d5db]">{fmtUSD(p.price)}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#6b7280]">{p.whop_product_id ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: p.active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                      color:           p.active ? '#34d399'                : '#6b7280',
                    }}
                  >
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditProd(p)} className="text-[#4b5563] hover:text-[#9ca3af]">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="text-[#4b5563] hover:text-[#f87171] disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editProd !== undefined && (
        <ProductModal
          product={editProd}
          onClose={() => setEditProd(undefined)}
          onSaved={() => { setEditProd(undefined); load() }}
        />
      )}
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────

type Tab = 'overview' | 'sales' | 'products'

const EMPTY_SUMMARY: RevenueSummary = {
  period:        { from: '', to: '' },
  cashCollected: 0,
  netRevenue:    0,
  mrr:           0,
  arr:           0,
  newMrr:        0,
  avgDealValue:  0,
  totalSales:    0,
  byTier:        [],
  byPlatform:    [],
  byCloser:      [],
  bySource:      [],
  monthly:       [],
}

const EMPTY_EXTRAS: OverviewExtras = {
  allTimeTiers: [], monthTiers: [], allTimeExpenses: 0, monthExpenses: 0, outstandingAmt: 0,
}

export default function RevenueView() {
  const [tab,             setTab]             = useState<Tab>('overview')
  const [range,           setRange]           = useState<Range>('30d')
  const [customFrom,      setCustomFrom]      = useState<string | undefined>()
  const [customTo,        setCustomTo]        = useState<string | undefined>()
  const [summary,         setSummary]         = useState<RevenueSummary | null>(null)
  const [summaryLoading,  setSummaryLoading]  = useState(true)
  const [summaryError,    setSummaryError]    = useState<string | null>(null)
  const [products,        setProducts]        = useState<Product[]>([])
  const [syncing,         setSyncing]         = useState(false)
  const [syncError,       setSyncError]       = useState<string | null>(null)
  const [extras,          setExtras]          = useState<OverviewExtras>(EMPTY_EXTRAS)

  const loadSummary = useCallback(async (r: Range, from?: string, to?: string) => {
    setSummary(null)
    setSummaryLoading(true)
    setSummaryError(null)
    try {
      const p = new URLSearchParams({ range: r })
      if (r === 'custom' && from) p.set('from', from)
      if (r === 'custom' && to)   p.set('to', to)
      const res  = await fetch(`/api/revenue/summary?${p}`)
      const data = await res.json()
      if (!res.ok) {
        setSummaryError(data?.error ?? 'Failed to load summary')
        setSummary(EMPTY_SUMMARY)
      } else {
        // Ensure all required keys exist — treat missing/empty object as zero-state
        setSummary({ ...EMPTY_SUMMARY, ...data })
      }
    } catch (e) {
      setSummaryError('Network error — could not load summary')
      setSummary(EMPTY_SUMMARY)
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  const loadProducts = useCallback(async () => {
    const res  = await fetch('/api/revenue/products')
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const res  = await fetch('/api/revenue/whop/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setSyncError(json.error ?? 'Sync failed')
        return
      }
    } catch {
      setSyncError('Network error')
      return
    } finally {
      setSyncing(false)
    }
    await Promise.all([loadSummary(range, customFrom, customTo), loadProducts()])
  }, [range, customFrom, customTo, loadSummary, loadProducts])

  // Load extras: all-time tiers, monthly tiers, expenses, outstanding
  const loadExtras = useCallback(async () => {
    try {
      const monthStart = new Date()
      monthStart.setDate(1)
      const monthStartStr = monthStart.toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)

      const [allRes, monRes, expAllRes, expMonRes, instRes] = await Promise.all([
        fetch('/api/revenue/summary?range=all'),
        fetch('/api/revenue/summary?range=month'),
        fetch('/api/revenue/expenses'),
        fetch(`/api/revenue/expenses?from=${monthStartStr}&to=${today}`),
        fetch('/api/revenue/instalments?status=pending,overdue'),
      ])

      const [allData, monData, expAll, expMon, instData] = await Promise.all([
        allRes.json(), monRes.json(), expAllRes.json(), expMonRes.json(), instRes.json(),
      ])

      const allTimeTiers  = (allData.byTier ?? []) as Array<{ tier: string; total: number }>
      const monthTiers    = (monData.byTier ?? []) as Array<{ tier: string; total: number }>
      const allTimeExpenses = Array.isArray(expAll) ? expAll.reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0) : 0
      const monthExpenses   = Array.isArray(expMon) ? expMon.reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0) : 0
      const outstandingAmt  = Array.isArray(instData) ? instData.reduce((s: number, i: { amount: number }) => s + Number(i.amount), 0) : 0

      setExtras({ allTimeTiers, monthTiers, allTimeExpenses, monthExpenses, outstandingAmt })
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadSummary(range, customFrom, customTo) }, [range, customFrom, customTo, loadSummary])
  useEffect(() => { loadProducts() }, [loadProducts])
  useEffect(() => { loadExtras() }, [loadExtras])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'sales',     label: 'Sales' },
    { id: 'products',  label: 'Products' },
  ]

  return (
    <div>
      {/* Snapshot banner — always visible */}
      <RevenueSnapshotBanner
        summary={summary}
        loading={summaryLoading}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
      />

      {/* Tab bar */}
      <div className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="relative px-4 py-2.5 text-[13px] font-medium transition-colors"
            style={{ color: tab === t.id ? '#f9fafb' : '#6b7280' }}
          >
            {t.label}
            {tab === t.id && (
              <span
                className="absolute bottom-0 left-0 h-0.5 w-full rounded-full"
                style={{ backgroundColor: '#2563eb' }}
              />
            )}
          </button>
        ))}

        {/* Sync button */}
        <div className="ml-auto flex items-center gap-2">
          {syncError && (
            <span className="text-[11px] text-[#f87171]">{syncError}</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 text-[#4b5563] hover:text-[#9ca3af] disabled:opacity-40"
            title="Sync from Whop and refresh"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {tab === 'overview' && (
        <OverviewTab
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          range={range}
          customFrom={customFrom}
          customTo={customTo}
          onRangeChange={(v) => {
            setRange(v.range)
            setCustomFrom(v.from)
            setCustomTo(v.to)
            loadSummary(v.range, v.from, v.to)
          }}
          extras={extras}
        />
      )}
      {tab === 'sales'    && <SalesTab products={products} />}
      {tab === 'products' && <ProductsTab />}
    </div>
  )
}
