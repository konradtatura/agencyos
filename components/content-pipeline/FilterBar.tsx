'use client'

import { Download } from 'lucide-react'
import type { PlatformFilter } from '@/lib/content-pipeline/types'

interface FilterBarProps {
  value: PlatformFilter
  onChange: (filter: PlatformFilter) => void
  onExport: () => void
}

const FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: 'all',       label: 'All'            },
  { value: 'instagram', label: 'Instagram only' },
  { value: 'youtube',   label: 'YouTube only'   },
]

export default function FilterBar({ value, onChange, onExport }: FilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {FILTERS.map((f) => {
        const isActive = value === f.value
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              fontSize: 12.5,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.12s',
              backgroundColor: isActive ? '#2563eb' : 'rgba(255,255,255,0.05)',
              color:           isActive ? '#fff'    : '#9ca3af',
              boxShadow:       isActive ? '0 0 16px rgba(37,99,235,0.3)' : 'none',
            }}
          >
            {f.label}
          </button>
        )
      })}
      </div>
      <button
        onClick={onExport}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             6,
          padding:         '5px 14px',
          borderRadius:    20,
          fontSize:        12.5,
          fontWeight:      400,
          cursor:          'pointer',
          border:          '1px solid rgba(255,255,255,0.12)',
          backgroundColor: 'rgba(255,255,255,0.05)',
          color:           '#9ca3af',
          transition:      'all 0.12s',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.backgroundColor = 'rgba(255,255,255,0.09)'
          el.style.color = '#d1d5db'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.backgroundColor = 'rgba(255,255,255,0.05)'
          el.style.color = '#9ca3af'
        }}
      >
        <Download size={13} />
        Export CSV
      </button>
    </div>
  )
}
