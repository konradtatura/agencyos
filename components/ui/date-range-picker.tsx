'use client'

import { useState, useRef, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom'

interface DateRangeValue {
  range: Range
  from?: string
  to?: string
}

interface Props {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  className?: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRESETS: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today'      },
  { value: '7d',    label: '7D'         },
  { value: '30d',   label: '30D'        },
  { value: 'month', label: 'This Month' },
  { value: 'all',   label: 'All Time'   },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ── Helpers ────────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtShort(d: Date): string {
  return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate()
}

// ── Nav button style ───────────────────────────────────────────────────────────

const NAV_BTN: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.4)',
  padding: '4px 7px',
  borderRadius: 4,
  fontSize: 14,
  lineHeight: 1,
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DateRangePicker({ value, onChange, className }: Props) {
  const [open,      setOpen]      = useState(false)
  const [leftYear,  setLeftYear]  = useState(() => new Date().getFullYear())
  const [leftMonth, setLeftMonth] = useState(() => new Date().getMonth())
  const [tempStart, setTempStart] = useState<Date | null>(null)
  const [tempEnd,   setTempEnd]   = useState<Date | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Pre-fill calendar when opening on an existing custom selection
  function handleOpenCalendar() {
    if (value.range === 'custom' && value.from && value.to) {
      const from = fromISO(value.from)
      setTempStart(from)
      setTempEnd(fromISO(value.to))
      // Navigate left calendar to the from-date month
      setLeftYear(from.getFullYear())
      setLeftMonth(from.getMonth())
    } else {
      setTempStart(null)
      setTempEnd(null)
      setLeftYear(new Date().getFullYear())
      setLeftMonth(new Date().getMonth())
    }
    setHoverDate(null)
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // ── Calendar navigation ────────────────────────────────────────────────────

  function navigate(delta: number) {
    let m = leftMonth + delta
    let y = leftYear
    while (m > 11) { m -= 12; y++ }
    while (m < 0)  { m += 12; y-- }
    setLeftMonth(m)
    setLeftYear(y)
  }

  // ── Day selection logic ────────────────────────────────────────────────────

  function handleDayClick(date: Date) {
    if (!tempStart || (tempStart && tempEnd)) {
      // Start fresh selection
      setTempStart(date)
      setTempEnd(null)
    } else {
      // Complete the range — swap if needed
      if (date < tempStart) {
        setTempEnd(tempStart)
        setTempStart(date)
      } else {
        setTempEnd(date)
      }
    }
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  function handleConfirm() {
    if (tempStart && tempEnd) {
      onChange({ range: 'custom', from: toISO(tempStart), to: toISO(tempEnd) })
      setOpen(false)
    }
  }

  // ── Range label ────────────────────────────────────────────────────────────

  function getRangeLabel(): string {
    if (!tempStart || !tempEnd) return ''
    const diff = Math.round((tempEnd.getTime() - tempStart.getTime()) / 86400000) + 1
    return `Showing ${diff} day${diff !== 1 ? 's' : ''}: ${fmtShort(tempStart)} → ${fmtShort(tempEnd)}, ${tempEnd.getFullYear()}`
  }

  // ── Month grid renderer ────────────────────────────────────────────────────

  function renderMonth(year: number, month: number, isRight: boolean) {
    const firstDay    = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays    = new Date(year, month, 0).getDate()
    const today       = new Date(); today.setHours(0, 0, 0, 0)

    // Effective end for hover preview
    const effStart = tempStart
    const effEnd   = tempEnd ?? (
      tempStart && hoverDate && hoverDate > tempStart ? hoverDate : null
    )
    const hasRange = !!(effStart && effEnd)

    const cells: React.ReactNode[] = []

    // Prev-month overflow (non-clickable)
    for (let i = 0; i < firstDay; i++) {
      cells.push(
        <div key={`p${i}`} style={{ textAlign: 'center', padding: '7px 2px', fontSize: 13, color: 'rgba(255,255,255,0.18)', cursor: 'default' }}>
          {prevDays - firstDay + i + 1}
        </div>
      )
    }

    // Current-month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curr = new Date(year, month, d)

      const isStart  = !!(effStart && curr.getTime() === effStart.getTime())
      const isEnd    = !!(effEnd   && curr.getTime() === effEnd.getTime())
      const inRange  = !!(effStart && effEnd && curr > effStart && curr < effEnd)
      const isToday  = curr.getTime() === today.getTime()

      let bg     = 'transparent'
      let color  = 'rgba(255,255,255,0.85)'
      let radius = '50%'

      if      (isStart && hasRange) { bg = '#1d6fd4'; color = '#fff'; radius = '50% 0 0 50%' }
      else if (isEnd   && hasRange) { bg = '#1d6fd4'; color = '#fff'; radius = '0 50% 50% 0'  }
      else if (isStart || isEnd)    { bg = '#1d6fd4'; color = '#fff'; radius = '50%'           }
      else if (inRange)             { bg = 'rgba(37,99,235,0.2)'; color = '#93c5fd'; radius = '0' }

      cells.push(
        <div
          key={d}
          onClick={() => handleDayClick(curr)}
          onMouseEnter={() => { if (tempStart && !tempEnd) setHoverDate(curr) }}
          onMouseLeave={() => setHoverDate(null)}
          style={{
            textAlign: 'center',
            padding: '7px 2px',
            fontSize: 13,
            cursor: 'pointer',
            background: bg,
            color,
            borderRadius: radius,
            fontWeight: isToday ? 600 : 400,
            transition: 'background 0.08s',
          }}
        >
          {d}
        </div>
      )
    }

    // Next-month overflow
    const trailing = (firstDay + daysInMonth) % 7
    const fill     = trailing === 0 ? 0 : 7 - trailing
    for (let i = 1; i <= fill; i++) {
      cells.push(
        <div key={`n${i}`} style={{ textAlign: 'center', padding: '7px 2px', fontSize: 13, color: 'rgba(255,255,255,0.18)', cursor: 'default' }}>
          {i}
        </div>
      )
    }

    return (
      <div style={{ flex: 1, padding: '12px 16px 16px' }}>
        {/* Month header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          {!isRight ? (
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => navigate(-12)} style={NAV_BTN} title="Previous year">«</button>
              <button onClick={() => navigate(-1)}  style={NAV_BTN} title="Previous month">‹</button>
            </div>
          ) : <div style={{ width: 52 }} />}

          <span style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb' }}>
            {MONTHS[month]} {year}
          </span>

          {isRight ? (
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => navigate(1)}   style={NAV_BTN} title="Next month">›</button>
              <button onClick={() => navigate(12)}  style={NAV_BTN} title="Next year">»</button>
            </div>
          ) : <div style={{ width: 52 }} />}
        </div>

        {/* Day-of-week labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
          {DAY_LABELS.map(l => (
            <div key={l} style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.28)', padding: '2px 0' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px 0' }}>
          {cells}
        </div>
      </div>
    )
  }

  // ── Right calendar is always leftMonth + 1 ─────────────────────────────────

  const rightMonth = (leftMonth + 1) % 12
  const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear

  // ── Input bar label ────────────────────────────────────────────────────────

  const isCustom    = value.range === 'custom' && value.from && value.to
  const customLabel = isCustom ? `${value.from} → ${value.to}` : null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }} className={className}>

      {/* ── Pill bar ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>

        {PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => { onChange({ range: p.value }); setOpen(false) }}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: value.range === p.value ? '#2563eb' : 'rgba(255,255,255,0.06)',
              color:      value.range === p.value ? '#fff'    : '#9ca3af',
              transition: 'all 0.1s',
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </button>
        ))}

        {customLabel ? (
          /* Custom range pill — click label to re-open, × to clear */
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 20, background: '#2563eb', overflow: 'hidden' }}>
            <span
              onClick={handleOpenCalendar}
              title="Click to change dates"
              style={{
                padding: '5px 10px 5px 12px',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#fff',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {customLabel}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onChange({ range: '30d' }) }}
              title="Clear custom range"
              style={{ padding: '5px 10px 5px 4px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1 }}
            >
              ×
            </span>
          </div>
        ) : (
          <button
            onClick={handleOpenCalendar}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
              color: '#9ca3af',
              whiteSpace: 'nowrap',
            }}
          >
            Custom ▾
          </button>
        )}
      </div>

      {/* ── Calendar dropdown ──────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 200,
            background: '#0d1117',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: 540,
          }}
        >
          {/* Date boxes + Reset */}
          <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                padding: '6px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: tempStart ? '#f9fafb' : '#4b5563',
                minWidth: 112,
                textAlign: 'center',
              }}
            >
              {tempStart ? toISO(tempStart) : '—'}
            </div>

            <span style={{ color: '#4b5563', fontSize: 14, userSelect: 'none' }}>→</span>

            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                padding: '6px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: tempEnd ? '#f9fafb' : '#4b5563',
                minWidth: 112,
                textAlign: 'center',
              }}
            >
              {tempEnd ? toISO(tempEnd) : '—'}
            </div>

            <button
              onClick={() => { setTempStart(null); setTempEnd(null); setHoverDate(null) }}
              style={{
                marginLeft: 'auto',
                background: '#cc3333',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ↺ Reset
            </button>
          </div>

          {/* Range label */}
          {tempStart && tempEnd && (
            <div style={{ padding: '6px 16px 0', fontSize: 12, color: '#6b7280' }}>
              {getRangeLabel()}
            </div>
          )}

          {/* Calendars */}
          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 10 }}>
            {renderMonth(leftYear, leftMonth, false)}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
            {renderMonth(rightYear, rightMonth, true)}
          </div>

          {/* Confirm */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '8px 16px 12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <button
              onClick={handleConfirm}
              disabled={!tempStart || !tempEnd}
              style={{
                background: tempStart && tempEnd ? '#1d6fd4' : 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 22px',
                color: tempStart && tempEnd ? '#fff' : '#4b5563',
                fontSize: 13,
                fontWeight: 500,
                cursor: tempStart && tempEnd ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
