'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        border:       '1px solid rgba(255,255,255,0.12)',
        color:        '#9ca3af',
        fontSize:     '13px',
        padding:      '6px 12px',
        borderRadius: '8px',
        background:   'transparent',
        cursor:       'pointer',
      }}
    >
      Print
    </button>
  )
}
