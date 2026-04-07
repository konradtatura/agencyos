'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, Phone, TrendingUp, DollarSign, AlertTriangle,
  Zap, Target, Star, Activity, ChevronLeft, CheckCircle2,
  XCircle, BarChart2,
} from 'lucide-react'
import StatCard from '@/components/ui/stat-card'

// ── Types ─────────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | 'today'

interface SetterStats {
  total_submissions: number
  total_active_members: number
  eod_completion_rate: number
  total_outbound_attempts: number
  total_calls_booked: number
  avg_booking_rate: number
  avg_response_rate: number
  avg_energy_level: number
  wow_growth_calls_booked: number | null
  calls_by_setter: { name: string; calls_booked: number }[]
  weekly_trend: { week: string; calls_booked: number; submissions: number }[]
  leaderboard: { uid: string; name: string; calls_booked: number; booking_rate: number; avg_energy: number }[]
  red_flags: { uid: string; name: string; calls_booked: number; booking_rate: number; avg_energy: number }[]
  activity_feed: { id: string; for_date: string; name: string; top_3_wins: string | null; calls_booked: number | null; energy_level: number | null }[]
}

interface CloserStats {
  total_submissions: number
  total_calls_completed: number
  total_revenue_closed: number
  total_cash_collected: number
  avg_close_rate: number
  avg_show_rate: number
  no_close_distribution: { reason: string; count: number }[]
  daily_revenue_trend: { date: string; revenue_closed: number; cash_collected: number; calls_closed: number }[]
  weekly_trend: { week: string; calls_closed: number }[]
  close_rate_by_closer: { name: string; close_rate: number }[]
  leaderboard: { uid: string; name: string; calls_closed: number; calls_completed: number; close_rate: number; revenue_closed: number; avg_confidence: number }[]
  red_flags: { uid: string; name: string; close_rate: number; avg_confidence: number }[]
  activity_feed: { id: string; for_date: string; name: string; no_close_reasons: string | null; calls_closed: number | null; revenue_closed: number | null }[]
}

interface SummaryData {
  setter: SetterStats
  closer: CloserStats
}

// ── Chart theme ───────────────────────────────────────────────────────────────

const CHART_GRID_COLOR   = 'rgba(255,255,255,0.06)'
const CHART_AXIS_COLOR   = '#4b5563'
const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#1f2937',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#f9fafb',
  fontSize: 12,
}

const PIE_COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtWeek(w: string) {
  return new Date(w + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      <div className="rounded-lg p-1.5" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
        {icon}
      </div>
      <h2 className="text-[16px] font-bold text-[#f9fafb]">{children}</h2>
    </div>
  )
}

function RangeTabs({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
      {(['today', '7d', '30d'] as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all"
          style={
            range === r
              ? { backgroundColor: 'rgba(37,99,235,0.25)', color: '#60a5fa' }
              : { color: '#6b7280' }
          }
        >
          {r === 'today' ? 'Today' : r === '7d' ? '7 days' : '30 days'}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <BarChart2 className="mb-3 h-8 w-8 text-[#374151]" />
      <p className="text-[13px] text-[#4b5563]">{message}</p>
    </div>
  )
}

// ── Setter Dashboard Section ──────────────────────────────────────────────────

function SetterSection({ data }: { data: SetterStats }) {
  return (
    <div className="space-y-8">
      <SectionTitle icon={<TrendingUp className="h-4 w-4 text-[#2563eb]" />}>
        Setter Performance
      </SectionTitle>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Active Setters"
          value={data.total_active_members}
          icon={Users}
        />
        <StatCard
          title="EOD Completion (Week)"
          value={`${data.eod_completion_rate}%`}
          icon={CheckCircle2}
        />
        <StatCard
          title="WoW Calls Booked"
          value={data.wow_growth_calls_booked != null ? `${data.wow_growth_calls_booked > 0 ? '+' : ''}${data.wow_growth_calls_booked}%` : '—'}
          change={data.wow_growth_calls_booked ?? undefined}
          icon={TrendingUp}
        />
        <StatCard
          title="Outbound Attempts"
          value={data.total_outbound_attempts.toLocaleString()}
          icon={Zap}
        />
        <StatCard
          title="Calls Booked"
          value={data.total_calls_booked.toLocaleString()}
          icon={Phone}
        />
        <StatCard
          title="Avg Booking Rate"
          value={`${data.avg_booking_rate}%`}
          icon={Target}
        />
        <StatCard
          title="Avg Response Rate"
          value={`${data.avg_response_rate}%`}
          icon={Activity}
        />
        <StatCard
          title="Avg Energy Level"
          value={`${data.avg_energy_level}/10`}
          icon={Star}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Calls booked by setter */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Calls Booked by Setter</p>
          {data.calls_by_setter.length === 0 ? (
            <EmptyState message="No setter data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.calls_by_setter} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="calls_booked" name="Calls Booked" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Weekly trend */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Weekly Calls Booked Trend</p>
          {data.weekly_trend.length === 0 ? (
            <EmptyState message="No weekly data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.weekly_trend.map((w) => ({ ...w, week: fmtWeek(w.week) }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="week" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="calls_booked" name="Calls Booked" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Leaderboard + Red flags */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Leaderboard */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Setter Leaderboard</p>
          {data.leaderboard.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Name', 'Calls Booked', 'Booking Rate', 'Energy'].map((h) => (
                      <th key={h} className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4b5563]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {data.leaderboard.map((s, i) => (
                    <tr key={s.uid}>
                      <td className="py-2.5 text-[13px] text-[#f9fafb]">
                        <span className="mr-2 text-[11px] text-[#4b5563]">#{i + 1}</span>
                        {s.name}
                      </td>
                      <td className="py-2.5 font-mono text-[13px] font-semibold text-[#f9fafb]">{s.calls_booked}</td>
                      <td className="py-2.5 font-mono text-[13px]" style={{ color: s.booking_rate < 20 ? '#ef4444' : '#10b981' }}>{s.booking_rate}%</td>
                      <td className="py-2.5 font-mono text-[13px]" style={{ color: s.avg_energy < 6 ? '#f59e0b' : '#9ca3af' }}>{s.avg_energy}/10</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Red Flags */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
            <p className="text-[13px] font-semibold text-[#f9fafb]">Red Flags</p>
            <span className="text-[11px] text-[#4b5563]">— energy &lt;6 or booking rate &lt;20%</span>
          </div>
          {data.red_flags.length === 0 ? (
            <div className="flex items-center gap-2 py-4">
              <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
              <p className="text-[13px] text-[#10b981]">All setters performing within targets</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.red_flags.map((s) => (
                <div
                  key={s.uid}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
                >
                  <p className="text-[13px] font-medium text-[#f9fafb]">{s.name}</p>
                  <div className="flex gap-4">
                    {s.booking_rate < 20 && (
                      <span className="text-[12px] text-[#ef4444]">Booking {s.booking_rate}%</span>
                    )}
                    {s.avg_energy < 6 && (
                      <span className="text-[12px] text-[#f59e0b]">Energy {s.avg_energy}/10</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Activity feed */}
      <Card>
        <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Recent Setter Activity</p>
        {data.activity_feed.length === 0 ? (
          <EmptyState message="No submissions yet" />
        ) : (
          <div className="space-y-2">
            {data.activity_feed.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg px-3 py-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="shrink-0 pt-0.5">
                  <div className="h-2 w-2 rounded-full bg-[#2563eb]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-medium text-[#f9fafb]">{item.name}</p>
                    <span className="text-[11px] text-[#4b5563]">{fmtDate(item.for_date)}</span>
                    {item.calls_booked != null && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#60a5fa]" style={{ backgroundColor: 'rgba(37,99,235,0.15)' }}>
                        {item.calls_booked} booked
                      </span>
                    )}
                    {item.energy_level != null && (
                      <span className="text-[11px]" style={{ color: item.energy_level < 6 ? '#f59e0b' : '#6b7280' }}>
                        ⚡ {item.energy_level}/10
                      </span>
                    )}
                  </div>
                  {item.top_3_wins && (
                    <p className="truncate text-[12px] text-[#6b7280]">{item.top_3_wins}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Closer Dashboard Section ──────────────────────────────────────────────────

function CloserSection({ data }: { data: CloserStats }) {
  return (
    <div className="space-y-8">
      <SectionTitle icon={<Phone className="h-4 w-4 text-[#2563eb]" />}>
        Closer Performance
      </SectionTitle>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Calls Completed"  value={data.total_calls_completed.toLocaleString()} icon={Phone}       />
        <StatCard title="Revenue Closed"   value={fmtCurrency(data.total_revenue_closed)}      icon={DollarSign}  />
        <StatCard title="Avg Close Rate"   value={`${data.avg_close_rate}%`}                   icon={Target}      />
        <StatCard title="Avg Show Rate"    value={`${data.avg_show_rate}%`}                    icon={Activity}    />
        <div
          className="rounded-xl p-5 lg:col-span-1"
          style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
        >
          <p className="mb-1 text-[12.5px] font-medium text-[#10b981]">Total Cash Collected</p>
          <p className="font-mono text-[28px] font-bold leading-none text-[#10b981]">
            {fmtCurrency(data.total_cash_collected)}
          </p>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily revenue trend */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Daily Revenue Trend</p>
          {data.daily_revenue_trend.length === 0 ? (
            <EmptyState message="No closer data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily_revenue_trend.map((d) => ({ ...d, date: fmtDate(d.date) }))} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, '']} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                <Line type="monotone" dataKey="revenue_closed" name="Revenue Closed" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cash_collected" name="Cash Collected" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Close rate by closer */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Avg Close Rate by Closer</p>
          {data.close_rate_by_closer.length === 0 ? (
            <EmptyState message="No closer data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.close_rate_by_closer} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: unknown) => [`${Number(v)}%`, 'Close Rate']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="close_rate" name="Close Rate" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* No-close reasons pie */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">No-Close Reasons Distribution</p>
          {data.no_close_distribution.length === 0 ? (
            <EmptyState message="No no-close data yet" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie
                    data={data.no_close_distribution}
                    dataKey="count"
                    nameKey="reason"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                  >
                    {data.no_close_distribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {data.no_close_distribution.map((item, i) => (
                  <div key={item.reason} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <p className="flex-1 truncate text-[12px] text-[#9ca3af]">{item.reason}</p>
                    <span className="text-[12px] font-semibold text-[#f9fafb]">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Weekly calls closed trend */}
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Weekly Calls Closed Trend</p>
          {data.weekly_trend.length === 0 ? (
            <EmptyState message="No weekly data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.weekly_trend.map((w) => ({ ...w, week: fmtWeek(w.week) }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="week" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="calls_closed" name="Calls Closed" stroke="#7c3aed" strokeWidth={2} dot={{ fill: '#7c3aed', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Leaderboard + Red flags */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Top Closers</p>
          {data.leaderboard.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Name', 'Close Rate', 'Revenue', 'Confidence'].map((h) => (
                      <th key={h} className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4b5563]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {data.leaderboard.map((c, i) => (
                    <tr key={c.uid}>
                      <td className="py-2.5 text-[13px] text-[#f9fafb]">
                        <span className="mr-2 text-[11px] text-[#4b5563]">#{i + 1}</span>
                        {c.name}
                      </td>
                      <td className="py-2.5 font-mono text-[13px]" style={{ color: c.close_rate < 30 ? '#ef4444' : '#10b981' }}>{c.close_rate}%</td>
                      <td className="py-2.5 font-mono text-[13px] text-[#f9fafb]">{fmtCurrency(c.revenue_closed)}</td>
                      <td className="py-2.5 font-mono text-[13px]" style={{ color: c.avg_confidence < 6 ? '#f59e0b' : '#9ca3af' }}>{c.avg_confidence}/10</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
            <p className="text-[13px] font-semibold text-[#f9fafb]">Red Flags</p>
            <span className="text-[11px] text-[#4b5563]">— confidence &lt;6 or close rate &lt;30%</span>
          </div>
          {data.red_flags.length === 0 ? (
            <div className="flex items-center gap-2 py-4">
              <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
              <p className="text-[13px] text-[#10b981]">All closers performing within targets</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.red_flags.map((c) => (
                <div
                  key={c.uid}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
                >
                  <p className="text-[13px] font-medium text-[#f9fafb]">{c.name}</p>
                  <div className="flex gap-4">
                    {c.close_rate < 30 && (
                      <span className="text-[12px] text-[#ef4444]">Close {c.close_rate}%</span>
                    )}
                    {c.avg_confidence < 6 && (
                      <span className="text-[12px] text-[#f59e0b]">Conf {c.avg_confidence}/10</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Activity feed */}
      <Card>
        <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Recent Closer Activity</p>
        {data.activity_feed.length === 0 ? (
          <EmptyState message="No submissions yet" />
        ) : (
          <div className="space-y-2">
            {data.activity_feed.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg px-3 py-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="shrink-0 pt-0.5">
                  <div className="h-2 w-2 rounded-full bg-[#7c3aed]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-[13px] font-medium text-[#f9fafb]">{item.name}</p>
                    <span className="text-[11px] text-[#4b5563]">{fmtDate(item.for_date)}</span>
                    {item.calls_closed != null && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#a78bfa]" style={{ backgroundColor: 'rgba(124,58,237,0.15)' }}>
                        {item.calls_closed} closed
                      </span>
                    )}
                    {item.revenue_closed != null && item.revenue_closed > 0 && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#34d399]" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                        {fmtCurrency(item.revenue_closed)}
                      </span>
                    )}
                  </div>
                  {item.no_close_reasons && (
                    <p className="text-[12px] text-[#6b7280]">
                      No-close: {item.no_close_reasons}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type DashTab = 'setter' | 'closer'

export default function EodDashboardPage() {
  const router = useRouter()
  const [range, setRange]     = useState<Range>('7d')
  const [tab, setTab]         = useState<DashTab>('setter')
  const [data, setData]       = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  const load = useCallback(async (r: Range) => {
    setLoading(true)
    const res = await fetch(`/api/forms/eod/summary?range=${r}`)
    if (res.status === 403) {
      setAuthorized(false)
      setLoading(false)
      return
    }
    setAuthorized(true)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [])

  useEffect(() => {
    // Verify role client-side too
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/dashboard/forms'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (!profile || (profile.role !== 'creator' && profile.role !== 'super_admin')) {
        router.push('/dashboard/forms')
        return
      }
      load(range)
    }
    checkAuth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRangeChange(r: Range) {
    setRange(r)
    load(r)
  }

  if (!authorized && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#0a0f1e' }}>
        <div className="text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-[#ef4444]" />
          <p className="text-[15px] text-[#9ca3af]">Access restricted to creators and admins.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/dashboard/forms')}
            className="mb-3 flex items-center gap-1.5 text-[12px] text-[#6b7280] transition-colors hover:text-[#9ca3af]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to Forms
          </button>
          <h1 className="text-[22px] font-bold text-[#f9fafb]">EOD Performance Dashboard</h1>
          <p className="text-[13px] text-[#6b7280]">Setter and closer daily reporting analytics</p>
        </div>
        <RangeTabs range={range} onChange={handleRangeChange} />
      </div>

      {/* Section tabs */}
      <div
        className="mb-8 flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}
      >
        {([
          { id: 'setter', label: 'Setter Section', icon: <TrendingUp className="h-4 w-4" /> },
          { id: 'closer', label: 'Closer Section', icon: <Phone className="h-4 w-4" /> },
        ] as { id: DashTab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all"
            style={tab === t.id ? { backgroundColor: '#2563eb', color: '#fff' } : { color: '#9ca3af' }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            />
          ))}
        </div>
      ) : data ? (
        tab === 'setter'
          ? <SetterSection data={data.setter} />
          : <CloserSection data={data.closer} />
      ) : null}
    </div>
  )
}
