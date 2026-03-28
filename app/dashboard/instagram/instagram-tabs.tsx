import Link from 'next/link'

const TABS = [
  { label: 'Overview', href: '/dashboard/instagram' },
  { label: 'Content',  href: '/dashboard/instagram/content' },
  { label: 'Analysis', href: '/dashboard/instagram/analysis' },
]

/**
 * Tab navigation for the Instagram section.
 * Server component — activePath is passed explicitly by each page so
 * the active state is determined during SSR without a client-side hook.
 */
export default function InstagramTabs({ activePath }: { activePath: string }) {
  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {TABS.map(({ label, href }) => {
        const active = activePath === href
        return (
          <Link
            key={href}
            href={href}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-all"
            style={
              active
                ? { backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa' }
                : { color: '#6b7280' }
            }
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
