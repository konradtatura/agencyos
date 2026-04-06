'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronUp, ChevronDown, ArrowUpDown, Download } from 'lucide-react'
import type { Lead, PipelineStage } from '@/types/crm'
import { Skeleton } from '@/components/ui/skeleton'

const TIER_LABELS: Record<string, string>  = { ht: 'HT', mt: 'MT', lt: 'LT' }
const TIER_COLORS: Record<string, string>  = { ht: '#60a5fa', mt: '#fbbf24', lt: '#34d399' }

const SOURCE_LABELS: Record<string, string> = {
  story: 'Story', reel: 'Reel', organic: 'Organic',
  manual: 'Manual', vsl_funnel: 'VSL',
}
const SOURCE_COLORS: Record<string, string> = {
  story: '#c084fc', reel: '#60a5fa', organic: '#9ca3af',
  manual: '#9ca3af', vsl_funnel: '#34d399',
}

const PAGE_SIZE = 20

type SortField = 'name' | 'stage' | 'offer_tier' | 'deal_value' | 'follow_up_date' | 'created_at' | 'updated_at'
type SortDir   = 'asc' | 'desc'

interface Filters {
  search:   string
  pipeline: 'all' | 'main' | 'downgrade'
  tier:     'all' | 'ht' | 'mt' | 'lt'
  stage:    string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir
  onSort: (f: SortField) => void
}) {
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
        fontSize: 10.5, fontWeight: 600,
        color: active ? '#9ca3af' : '#4b5563',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        whiteSpace: 'nowrap', userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'color 0.12s',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = '#6b7280' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = '#4b5563' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp size={10} strokeWidth={2.5} /> : <ChevronDown size={10} strokeWidth={2.5} />
          : <ArrowUpDown size={10} color="#374151" strokeWidth={2} />}
      </span>
    </th>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 6, fontSize: 11.5,
        fontWeight: active ? 600 : 400,
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

// ── Main ──────────────────────────────────────────────────────────────────────

interface LeadListViewProps {
  stages: PipelineStage[]
  onSelectLead: (id: string) => void
  selectedLeadId: string | null
  refreshKey?: number
}

export default function LeadListView({ stages, onSelectLead, selectedLeadId, refreshKey }: LeadListViewProps) {
  const [leads, setLeads]             = useState<Lead[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(0)

  const [filters, setFilters] = useState<Filters>({ search: '', pipeline: 'main', tier: 'all', stage: '' })
  const [searchInput, setSearchInput] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')

  const fetchLeads = useCallback(async (f: Filters, sf: SortField, sd: SortDir, p: number) => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (f.pipeline !== 'all') params.set('pipeline_type', f.pipeline)
      if (f.tier !== 'all')     params.set('offer_tier', f.tier)
      if (f.stage)              params.set('stage', f.stage)
      if (f.search)             params.set('search', f.search)
      params.set('sort', sf)
      params.set('dir', sd)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(p * PAGE_SIZE))

      const res = await fetch(`/api/crm/leads?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      const data: Lead[] = await res.json()
      setLeads(data)
      setTotal((prev) => data.length === PAGE_SIZE ? Math.max(prev, (p + 1) * PAGE_SIZE + 1) : p * PAGE_SIZE + data.length)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }))
      setPage(0)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  useEffect(() => { fetchLeads(filters, sortField, sortDir, page) }, [filters, sortField, sortDir, page, fetchLeads, refreshKey])

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(0)
  }

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(0)
  }

  function exportCsv() {
    const headers = ['Name', 'Handle', 'Stage', 'Tier', 'Deal Value', 'Source', 'Follow-Up', 'Created']
    const rows = leads.map((l) => [
      l.name,
      l.ig_handle ?? '',
      l.stage,
      l.offer_tier ?? '',
      l.deal_value ?? '',
      l.lead_source_type ?? '',
      l.follow_up_date ?? '',
      l.created_at,
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a   = document.createElement('a')
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const showing = `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, page * PAGE_SIZE + leads.length)}`
  const colHeaderProps = { sortField, sortDir, onSort: handleSort }

  // Sort overdue rows to top before rendering
  const sortedLeads = [...leads].sort((a, b) => {
    const aOver = a.follow_up_date && new Date(a.follow_up_date) < new Date()
    const bOver = b.follow_up_date && new Date(b.follow_up_date) < new Date()
    if (aOver && !bOver) return -1
    if (!aOver && bOver) return 1
    return 0
  })

  return (
    <div>
      {/* Filter bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          marginBottom: 16, padding: '10px 14px',
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search size={13} color="#4b5563" strokeWidth={2}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name or handle…"
            style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: 7, fontSize: 12, color: '#d1d5db', backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.07)', outline: 'none' }}
          />
        </div>

        {/* Pipeline toggle */}
        <div style={{ display: 'flex', gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2 }}>
          <ToggleBtn active={filters.pipeline === 'all'}       onClick={() => setFilter('pipeline', 'all')}>All</ToggleBtn>
          <ToggleBtn active={filters.pipeline === 'main'}      onClick={() => setFilter('pipeline', 'main')}>Main</ToggleBtn>
          <ToggleBtn active={filters.pipeline === 'downgrade'} onClick={() => setFilter('pipeline', 'downgrade')}>Downgrade</ToggleBtn>
        </div>

        {/* Tier toggle */}
        <div style={{ display: 'flex', gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2 }}>
          <ToggleBtn active={filters.tier === 'all'} onClick={() => setFilter('tier', 'all')}>All Tiers</ToggleBtn>
          {(['ht', 'mt', 'lt'] as const).map((t) => (
            <ToggleBtn key={t} active={filters.tier === t} onClick={() => setFilter('tier', t)}>{TIER_LABELS[t]}</ToggleBtn>
          ))}
        </div>

        {/* Stage select — populated from DB stages */}
        <select
          value={filters.stage}
          onChange={(e) => setFilter('stage', e.target.value)}
          style={{
            padding: '6px 28px 6px 10px', borderRadius: 7, fontSize: 11.5,
            color: '#d1d5db', backgroundColor: '#111827',
            border: '1px solid rgba(255,255,255,0.07)',
            appearance: 'none', cursor: 'pointer', outline: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          <option value="">All Stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>

        {/* Export */}
        <button
          onClick={exportCsv}
          title="Export CSV"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7, fontSize: 11.5,
            color: '#6b7280', backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
            transition: 'color 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#9ca3af' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#6b7280' }}
        >
          <Download size={12} strokeWidth={2} />
          CSV
        </button>
      </div>

      {/* Table */}
      {fetchError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12 }}>
          <p style={{ color: '#ef4444', fontSize: 13 }}>{fetchError}</p>
          <button onClick={() => fetchLeads(filters, sortField, sortDir, page)} style={{ fontSize: 12, color: '#2563eb', padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.08)', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <ColHeader label="Name"      field="name"           {...colHeaderProps} />
                  <ColHeader label="Stage"     field="stage"          {...colHeaderProps} />
                  <ColHeader label="Tier"      field="offer_tier"     {...colHeaderProps} />
                  <ColHeader label="Deal"      field="deal_value"     {...colHeaderProps} />
                  <ColHeader label="Source"    field="updated_at"     {...colHeaderProps} />
                  <ColHeader label="Follow-Up" field="follow_up_date" {...colHeaderProps} />
                  <ColHeader label="Created"   field="created_at"     {...colHeaderProps} />
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
                ) : sortedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <p style={{ fontSize: 13, color: '#374151', textAlign: 'center', padding: '48px 0' }}>No leads match your filters</p>
                    </td>
                  </tr>
                ) : (
                  sortedLeads.map((lead, i) => {
                    const isSelected   = lead.id === selectedLeadId
                    const isLast       = i === sortedLeads.length - 1
                    const isOverdue    = lead.follow_up_date && new Date(lead.follow_up_date) < new Date()
                    const stageColor   = stages.find((s) => s.name === lead.stage)?.color ?? '#6b7280'
                    const tier         = lead.offer_tier
                    const followUp     = lead.follow_up_date
                      ? new Date(lead.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '—'
                    const createdAt    = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                    const sourceColor  = lead.lead_source_type ? SOURCE_COLORS[lead.lead_source_type] : null
                    const sourceLabel  = lead.lead_source_type ? SOURCE_LABELS[lead.lead_source_type] : null

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => onSelectLead(lead.id)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
                          borderLeft: isSelected ? '2.5px solid #2563eb' : '2.5px solid transparent',
                          backgroundColor: isOverdue
                            ? 'rgba(245,158,11,0.04)'
                            : isSelected
                              ? 'rgba(37,99,235,0.06)'
                              : 'transparent',
                          transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.02)'
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = isOverdue
                            ? 'rgba(245,158,11,0.04)'
                            : isSelected
                              ? 'rgba(37,99,235,0.06)'
                              : 'transparent'
                        }}
                      >
                        {/* Name */}
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
                            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: stageColor, flexShrink: 0 }} />
                            {lead.stage}
                          </span>
                        </td>

                        {/* Tier */}
                        <td style={{ padding: '10px 12px' }}>
                          {tier ? (
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: TIER_COLORS[tier], padding: '1px 6px', borderRadius: 4, backgroundColor: `${TIER_COLORS[tier]}15`, border: `1px solid ${TIER_COLORS[tier]}30` }}>
                              {TIER_LABELS[tier]}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#374151' }}>—</span>
                          )}
                        </td>

                        {/* Deal */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 12, color: lead.deal_value != null ? '#d1d5db' : '#374151' }}>
                            {lead.deal_value != null ? `$${lead.deal_value.toLocaleString()}` : '—'}
                          </span>
                        </td>

                        {/* Source */}
                        <td style={{ padding: '10px 12px' }}>
                          {sourceLabel ? (
                            <span style={{ fontSize: 10.5, fontWeight: 500, color: sourceColor ?? '#9ca3af' }}>
                              {sourceLabel}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#374151' }}>—</span>
                          )}
                        </td>

                        {/* Follow-up */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11.5, color: lead.follow_up_date ? (isOverdue ? '#f59e0b' : '#d1d5db') : '#374151' }}>
                            {followUp}
                          </span>
                        </td>

                        {/* Created */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, color: '#4b5563' }}>{createdAt}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11, color: '#4b5563' }}>
                {leads.length === 0 ? '0 results' : `Showing ${showing}`}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { label: 'Previous', disabled: page === 0,            onClick: () => setPage((p) => Math.max(0, p - 1)) },
                  { label: 'Next',     disabled: leads.length < PAGE_SIZE, onClick: () => setPage((p) => p + 1) },
                ].map(({ label, disabled, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    disabled={disabled}
                    style={{
                      padding: '4px 12px', borderRadius: 6, fontSize: 11.5,
                      color: disabled ? '#374151' : '#9ca3af',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
