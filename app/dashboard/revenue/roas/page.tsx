'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, DollarSign, Target, Loader2 } from 'lucide-react'
import type { RoasMetrics } from '@/types/revenue'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type Window = 'all_time' | 'current_month' | 'rolling_7d' | 'current_week'

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'all_time',      label: 'All Time' },
  { key: 'current_month', label: 'Current Month' },
  { key: 'rolling_7d',    label: 'Rolling 7 Days' },
  { key: 'current_week',  label: 'Current Week' },
]

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtNum(n: number, decimals = 1) {
  return n.toFixed(decimals)
}

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  color?: string
  badge?: string
  icon?: React.ReactNode
}

function MetricCard({ label, value, sub, color = '#f9fafb', badge, icon }: MetricCardProps) {
  return (
    <div className="rounded-xl p-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[#4b5563]">{icon}</span>}
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">{label}</p>
        </div>
        {badge && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>
            {badge}
          </span>
        )}
      </div>
      <p className="font-mono text-[24px] font-bold" style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-[12px] text-[#6b7280]">{sub}</p>}
    </div>
  )
}

export default function RoasPage() {
  const [window_, setWindow_] = useState<Window>('current_month')
  const [metrics, setMetrics] = useState<RoasMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [trend,   setTrend]   = useState<Array<{ date: string; revenue: number; ad_spend: number; roas: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/revenue/roas?window=${window_}`)
      const data = await res.json()
      if (res.ok) setMetrics(data)
    } finally {
      setLoading(false)
    }
  }, [window_])

  useEffect(() => { load() }, [load])

  // Load 90-day trend (all time but grouped by month)
  useEffect(() => {
    fetch('/api/revenue/roas?window=all_time')
      .then(r => r.json())
      .then(d => {
        if (d?.monthly_trend) setTrend(d.monthly_trend)
      })
      .catch(() => {})
  }, [])

  const roasColor = metrics ? (
    metrics.total_roas >= 3 ? '#34d399' : metrics.total_roas >= 1 ? '#fbbf24' : '#f87171'
  ) : '#f9fafb'

  return (
    <div className="min-h-screen pb-16 p-8" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/revenue" className="text-[#4b5563] hover:text-[#9ca3af] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-[20px] font-bold text-[#f9fafb]">ROAS Dashboard</h1>
          <p className="text-[13px] text-[#6b7280]">Return on ad spend and conversion analytics</p>
        </div>
      </div>

      {/* Window tabs */}
      <div className="mb-6 flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {WINDOWS.map(w => (
          <button
            key={w.key}
            onClick={() => setWindow_(w.key)}
            className="rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all"
            style={{
              backgroundColor: window_ === w.key ? '#2563eb' : 'transparent',
              color: window_ === w.key ? '#fff' : '#6b7280',
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[#4b5563]" />
        </div>
      ) : metrics ? (
        <>
          {/* Primary ROAS card */}
          <div className="mb-6 rounded-2xl p-6"
            style={{ backgroundColor: '#111827', border: `1px solid ${roasColor}30` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-widest text-[#4b5563]">Total ROAS</p>
                <p className="font-mono text-[48px] font-bold leading-none" style={{ color: roasColor }}>
                  {fmtNum(metrics.total_roas, 2)}x
                </p>
                <p className="mt-2 text-[13px] text-[#6b7280]">
                  {fmtUSD(metrics.total_revenue)} revenue on {fmtUSD(metrics.total_ad_spend)} ad spend
                </p>
              </div>
              <div className="text-right">
                <TrendingUp className="ml-auto mb-2 h-8 w-8" style={{ color: roasColor }} />
                <p className="text-[12px] text-[#6b7280]">
                  {metrics.total_conversions} sale{metrics.total_conversions !== 1 ? 's' : ''} closed
                </p>
              </div>
            </div>
          </div>

          {/* Metric cards grid */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard
              label="Ad Spend"
              value={fmtUSD(metrics.total_ad_spend)}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              color="#f87171"
              badge="Source of Truth"
            />
            <MetricCard
              label="Total Revenue"
              value={fmtUSD(metrics.total_revenue)}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              color="#34d399"
            />
            <MetricCard
              label="Net Revenue"
              value={fmtUSD(metrics.net_revenue)}
              color={metrics.net_revenue >= 0 ? '#34d399' : '#f87171'}
              sub="Revenue minus all expenses"
            />
            <MetricCard
              label="Booked Calls"
              value={String(metrics.booked_calls)}
              icon={<Target className="h-3.5 w-3.5" />}
              badge="From CRM"
              sub="Leads who showed"
            />
            <MetricCard
              label="Avg CPbC"
              value={metrics.booked_calls > 0 ? fmtUSD(metrics.avg_cpbc) : '—'}
              sub="Cost per booked call"
            />
            <MetricCard
              label="Conversions"
              value={String(metrics.total_conversions)}
              sub="Closed Won leads"
            />
            <MetricCard
              label="Avg CPA"
              value={metrics.total_conversions > 0 ? fmtUSD(metrics.avg_cpa) : '—'}
              sub="Cost per acquisition"
            />
            <MetricCard
              label="AOV"
              value={metrics.total_conversions > 0 ? fmtUSD(metrics.aov) : '—'}
              sub="Avg order value"
            />
            <MetricCard
              label="Total Expenses"
              value={fmtUSD(metrics.total_expenses)}
              color="#fbbf24"
              sub="All expense categories"
            />
          </div>

          {/* Conversion rate */}
          {metrics.booked_calls > 0 && (
            <div className="mb-6 rounded-xl p-5"
              style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">Conversion Rate</p>
              <div className="flex items-center gap-4">
                <span className="font-mono text-[28px] font-bold text-[#60a5fa]">
                  {fmtNum((metrics.total_conversions / metrics.booked_calls) * 100)}%
                </span>
                <span className="text-[13px] text-[#6b7280]">
                  {metrics.total_conversions} closed from {metrics.booked_calls} calls
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (metrics.total_conversions / metrics.booked_calls) * 100)}%`,
                    backgroundColor: '#2563eb',
                  }}
                />
              </div>
            </div>
          )}

          {/* Trend chart (if available) */}
          {trend.length > 1 && (
            <div className="rounded-xl p-5"
              style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">Monthly Revenue vs Ad Spend</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4b5563' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#4b5563' }} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(value) => fmtUSD(Number(value))}
                  />
                  <Line type="monotone" dataKey="revenue"  stroke="#34d399" strokeWidth={2} dot={false} name="Revenue" />
                  <Line type="monotone" dataKey="ad_spend" stroke="#f87171" strokeWidth={2} dot={false} name="Ad Spend" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : (
        <div className="py-16 text-center">
          <p className="text-[14px] text-[#6b7280]">No data available for this period</p>
        </div>
      )}
    </div>
  )
}
