'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronUp, ChevronDown, ArrowUpDown, Kanban } from 'lucide-react'
import type { Lead, LeadStage } from '@/types/crm'
import { MAIN_PIPELINE_STAGES } from '@/types/crm'
import { Skeleton } from '@/components/ui/skeleton'

// ── Config ────────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  dmd: "DM'd", qualifying: 'Qualifying', qualified: 'Qualified',
  call_booked: 'Call Booked', showed: 'Showed', closed_won: 'Closed Won',
  closed_lost: 'Closed Lost', follow_up: 'Follow-Up', nurture: 'Nurture',
  disqualified: 'Disqualified', dead: 'Dead',
  offered: 'Offered', interested: 'Interested', booked: 'Booked', closed: 'Closed',
}

const STAGE_COLORS: Record<string, string> = {
  dmd: '#6366f1', qualifying: '#8b5cf6', qualified: '#2563eb',
  call_booked: '#0ea5e9', showed: '#f59e0b', closed_won: '#10b981',
  closed_lost: '#ef4444', follow_up: '#f97316', nurture: '#14b8a6',
  disqualified: '#9ca3af', dead: '#4b5563',
  offered: '#6366f1', interested: '#8b5cf6', booked: '#f59e0b', closed: '#10b981',
}

const TIER_LABELS: Record<string, string> = { ht: 'HT', mt: 'MT', lt: 'LT' }
const TIER_COLORS: Record<string, string> = { ht: '#60a5fa', mt: '#fbbf24', lt: '#34d399' }

const PAGE_SIZE = 20

type SortField = 'name' | 'stage' | 'offer_tier' | 'deal_value' | 'follow_up_date' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  search: string
  pipeline: 'all' | 'main' | 'downgrade'
  tier: 'all' | 'ht' | 'mt' | 'lt'
  stage: LeadStage | ''
}

// ── Column header ──────────────────────────────────────────────────────────────

function ColHeader({
  label, field, sortField, sortDir, onSort,
}: {
  label: string
  field: SortField
  sortField: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
}) {
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
        fontSize: 10.5, fontWeight: 600, color: active ? '#9ca3af' : '#4b5563',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        whiteSpace: 'nowrap', userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'color 0.12s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#6b7280' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#4b5563' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp size={10} strokeWidth={2.5} />
            : <ChevronDown size={10} strokeWidth={2.5} />
          : <ArrowUpDown size={10} color="#374151" strokeWidth={2} />
        }
      </span>
    </th>
  )
}

// ── Toggle button ─────────────────────────────────────────────────────────────

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 6, fontSize: 11.5, fontWeight: active ? 600 : 400,
        color: active ? '#f9fafb' : '#6b7280',
        backgroundColor: active ? 'rgba(255,255,255,0.07)' : 'transparent',
        border: active ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface LeadListViewProps {
  onSwitchToPipeline: () => void
}

export default function LeadListView({ onSwitchToPipeline }: LeadListViewProps) {
  const router = useRouter()

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)

  const [filters, setFilters] = useState<Filters>({
    search: '', pipeline: 'all', tier: 'all', stage: '',
  })
  const [searchInput, setSearchInput] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fetchLeads = useCallback(async (
    f: Filters,
    sf: SortField,
    sd: SortDir,
    p: number,
  ) => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (f.pipeline !== 'all') params.set('pipeline_type', f.pipeline)
      if (f.tier !== 'all') params.set('offer_tier', f.tier)
      if (f.stage) params.set('stage', f.stage)
      if (f.search) params.set('search', f.search)
      params.set('sort', sf)
      params.set('dir', sd)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(p * PAGE_SIZE))

      const res = await fetch(`/api/crm/leads?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      const data: Lead[] = await res.json()
      setLeads(data)
      // Approximate total from response size
      setTotal(prev => (data.length === PAGE_SIZE ? Math.max(prev, (p + 1) * PAGE_SIZE + 1) : p * PAGE_SIZE + data.length))
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters(f => ({ ...f, search: searchInput }))
      setPage(0)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  useEffect(() => {
    fetchLeads(filters, sortField, sortDir, page)
  }, [filters, sortField, sortDir, page, fetchLeads])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(0)
  }

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showing = `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, page * PAGE_SIZE + leads.length)}`

  const colHeaderProps = { sortField, sortDir, onSort: handleSort }

  return (
    <div>
      {/* Filter bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          marginBottom: 16, padding: '10px 14px',
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search
            size={13} color="#4b5563" strokeWidth={2}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search name or handle…"
            style={{
              width: '100%', padding: '6px 10px 6px 30px', borderRadius: 7,
              fontSize: 12, color: '#d1d5db', backgroundColor: '#111827',
              border: '1px solid rgba(255,255,255,0.07)', outline: 'none',
            }}
          />
        </div>

        {/* Pipeline toggle */}
        <div style={{ display: 'flex', gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2 }}>
          <ToggleBtn active={filters.pipeline === 'all'} onClick={() => setFilter('pipeline', 'all')}>All</ToggleBtn>
          <ToggleBtn active={filters.pipeline === 'main'} onClick={() => setFilter('pipeline', 'main')}>Main</ToggleBtn>
          <ToggleBtn active={filters.pipeline === 'downgrade'} onClick={() => setFilter('pipeline', 'downgrade')}>Downgrade</ToggleBtn>
        </div>

        {/* Tier toggle */}
        <div style={{ display: 'flex', gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2 }}>
          <ToggleBtn active={filters.tier === 'all'} onClick={() => setFilter('tier', 'all')}>All Tiers</ToggleBtn>
          {(['ht', 'mt', 'lt'] as const).map(t => (
            <ToggleBtn key={t} active={filters.tier === t} onClick={() => setFilter('tier', t)}>
              {TIER_LABELS[t]}
            </ToggleBtn>
          ))}
        </div>

        {/* Stage select */}
        <select
          value={filters.stage}
          onChange={e => setFilter('stage', e.target.value as LeadStage | '')}
          style={{
            padding: '6px 28px 6px 10px', borderRadius: 7, fontSize: 11.5,
            color: '#d1d5db', backgroundColor: '#111827',
            border: '1px solid rgba(255,255,255,0.07)',
            appearance: 'none', cursor: 'pointer', outline: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          <option value="">All Stages</option>
          {MAIN_PIPELINE_STAGES.map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {fetchError ? (
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: 48, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
          }}
        >
          <p style={{ color: '#ef4444', fontSize: 13 }}>{fetchError}</p>
          <button
            onClick={() => fetchLeads(filters, sortField, sortDir, page)}
            style={{
              fontSize: 12, color: '#2563eb', padding: '6px 16px', borderRadius: 6,
              border: '1px solid rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.08)', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#0d1117',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <ColHeader label="Name" field="name" {...colHeaderProps} />
                  <ColHeader label="Stage" field="stage" {...colHeaderProps} />
                  <ColHeader label="Tier" field="offer_tier" {...colHeaderProps} />
                  <ColHeader label="Deal" field="deal_value" {...colHeaderProps} />
                  <ColHeader label="Follow-Up" field="follow_up_date" {...colHeaderProps} />
                  <ColHeader label="Created" field="created_at" {...colHeaderProps} />
                  <ColHeader label="Updated" field="updated_at" {...colHeaderProps} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <Skeleton style={{ height: 14, borderRadius: 4, width: j === 0 ? 120 : 70 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          justifyContent: 'center', gap: 10, padding: '48px 0',
                        }}
                      >
                        <p style={{ fontSize: 13, color: '#374151' }}>No leads match your filters</p>
                        <button
                          onClick={onSwitchToPipeline}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 12, color: '#2563eb', padding: '6px 14px', borderRadius: 6,
                            border: '1px solid rgba(37,99,235,0.25)',
                            backgroundColor: 'rgba(37,99,235,0.07)', cursor: 'pointer',
                          }}
                        >
                          <Kanban size={12} strokeWidth={2} />
                          View Pipeline
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, i) => {
                    const stageColor = STAGE_COLORS[lead.stage] ?? '#6b7280'
                    const tier = lead.offer_tier
                    const isLast = i === leads.length - 1

                    const followUp = lead.follow_up_date
                      ? new Date(lead.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '—'
                    const followUpOverdue = lead.follow_up_date
                      ? new Date(lead.follow_up_date) < new Date()
                      : false

                    const createdAt = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    const updatedAt = new Date(lead.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => router.push(`/dashboard/crm/${lead.id}`)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
                          transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                      >
                        {/* Name + handle */}
                        <td style={{ padding: '10px 12px' }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#e5e7eb' }}>{lead.name}</p>
                          {lead.ig_handle && (
                            <p style={{ fontSize: 10.5, color: '#4b5563', marginTop: 1 }}>@{lead.ig_handle}</p>
                          )}
                        </td>

                        {/* Stage */}
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 11, fontWeight: 500, color: stageColor,
                              padding: '2px 7px', borderRadius: 4,
                              backgroundColor: `${stageColor}12`,
                              border: `1px solid ${stageColor}25`,
                            }}
                          >
                            <span
                              style={{
                                width: 5, height: 5, borderRadius: '50%',
                                backgroundColor: stageColor,
                                flexShrink: 0,
                              }}
                            />
                            {STAGE_LABELS[lead.stage] ?? lead.stage}
                          </span>
                        </td>

                        {/* Tier */}
                        <td style={{ padding: '10px 12px' }}>
                          {tier ? (
                            <span
                              style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                                color: TIER_COLORS[tier],
                                padding: '1px 6px', borderRadius: 4,
                                backgroundColor: `${TIER_COLORS[tier]}15`,
                                border: `1px solid ${TIER_COLORS[tier]}30`,
                              }}
                            >
                              {TIER_LABELS[tier]}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#374151' }}>—</span>
                          )}
                        </td>

                        {/* Deal value */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 12, color: lead.deal_value != null ? '#d1d5db' : '#374151' }}>
                            {lead.deal_value != null ? `$${lead.deal_value.toLocaleString()}` : '—'}
                          </span>
                        </td>

                        {/* Follow-up */}
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              fontSize: 11.5,
                              color: lead.follow_up_date
                                ? followUpOverdue ? '#ef4444' : '#d1d5db'
                                : '#374151',
                            }}
                          >
                            {followUp}
                          </span>
                        </td>

                        {/* Created */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, color: '#4b5563' }}>{createdAt}</span>
                        </td>

                        {/* Updated */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, color: '#4b5563' }}>{updatedAt}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && leads.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span style={{ fontSize: 11, color: '#4b5563' }}>
                {leads.length === 0 ? '0 results' : `Showing ${showing}`}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11.5,
                    color: page === 0 ? '#374151' : '#9ca3af',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={leads.length < PAGE_SIZE}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11.5,
                    color: leads.length < PAGE_SIZE ? '#374151' : '#9ca3af',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    cursor: leads.length < PAGE_SIZE ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
