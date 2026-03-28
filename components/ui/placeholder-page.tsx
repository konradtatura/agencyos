interface PlaceholderPageProps {
  title: string
}

/**
 * Centered placeholder shown for every unbuilt route.
 * Each feature sprint replaces this with the real page content.
 */
export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="w-full max-w-sm rounded-2xl px-10 py-10 text-center"
        style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="#2563eb" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 className="mb-2 text-[15px] font-semibold text-[#f9fafb]">{title}</h2>
        <p className="text-[13px] leading-relaxed text-[#9ca3af]">
          This module is coming in the next sprint.
        </p>
      </div>
    </div>
  )
}
