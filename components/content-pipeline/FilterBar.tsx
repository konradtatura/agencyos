'use client'

import type { PlatformFilter } from '@/lib/content-pipeline/types'

interface FilterBarProps {
  value: PlatformFilter
  onChange: (filter: PlatformFilter) => void
}

const FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: 'all',       label: 'All'            },
  { value: 'instagram', label: 'Instagram only' },
  { value: 'youtube',   label: 'YouTube only'   },
]

export default function FilterBar({ value, onChange }: FilterBarProps) {
  return (
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
  )
}
