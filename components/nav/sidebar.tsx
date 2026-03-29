'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  BarChart3,
  Settings2,
  UserCog,
  Camera,
  Video,
  Layers,
  LayoutGrid,
  MessageSquare,
  LayoutList,
  DollarSign,
  UserPlus,
  PhoneCall,
  ClipboardList,
  BarChart2,
  Phone,
  Zap,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// ── Nav types ─────────────────────────────────────────────────────────────────

interface NavItem {
  href: string
  icon: LucideIcon
  label: string
  /** Live unread / count badge — only renders when > 0 */
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

// ── Nav configs ───────────────────────────────────────────────────────────────

const ADMIN_NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { href: '/admin',           icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/admin/creators',  icon: Users,           label: 'Creators'  },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { href: '/admin/performance', icon: TrendingUp, label: 'Performance' },
      { href: '/admin/reports',     icon: BarChart3,  label: 'Reports'     },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/settings', icon: Settings2, label: 'Settings' },
      { href: '/admin/team',     icon: UserCog,   label: 'Team'     },
    ],
  },
]

function creatorNav(dmUnreadCount: number): NavSection[] {
  return [
    {
      title: 'Overview',
      items: [
        { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      ],
    },
    {
      title: 'Content',
      items: [
        { href: '/dashboard/instagram', icon: Camera, label: 'Instagram' },
        { href: '/dashboard/youtube',           icon: Video,       label: 'YouTube'          },
        { href: '/dashboard/content-pipeline', icon: LayoutGrid,  label: 'Content Pipeline' },
        { href: '/dashboard/stories',          icon: Layers,      label: 'Stories'          },
      ],
    },
    {
      title: 'Sales',
      items: [
        { href: '/dashboard/dms',     icon: MessageSquare, label: 'DM Inbox', badge: dmUnreadCount },
        { href: '/dashboard/crm',     icon: LayoutList,    label: 'CRM'                            },
        { href: '/dashboard/metrics', icon: TrendingUp,    label: 'Metrics'                        },
        { href: '/dashboard/revenue', icon: DollarSign,    label: 'Revenue'                        },
      ],
    },
    {
      title: 'Team',
      items: [
        { href: '/dashboard/setters', icon: UserPlus,     label: 'Setters'     },
        { href: '/dashboard/closers', icon: PhoneCall,    label: 'Closers'     },
        { href: '/dashboard/forms',   icon: ClipboardList, label: 'Daily Forms' },
      ],
    },
    {
      title: 'Account',
      items: [
        { href: '/dashboard/settings', icon: Settings2, label: 'Settings' },
      ],
    },
  ]
}

const SETTER_NAV: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/setter/dms', icon: MessageSquare, label: 'DM Inbox' },
      { href: '/setter/crm', icon: LayoutList,    label: 'CRM'      },
    ],
  },
  {
    title: 'Accountability',
    items: [
      { href: '/setter/forms', icon: ClipboardList, label: 'Daily Forms' },
      { href: '/setter/stats', icon: BarChart2,     label: 'My Stats'    },
    ],
  },
]

const CLOSER_NAV: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/closer/crm',   icon: LayoutList, label: 'Pipeline' },
      { href: '/closer/calls', icon: Phone,      label: 'My Calls' },
    ],
  },
  {
    title: 'Accountability',
    items: [
      { href: '/closer/forms', icon: ClipboardList, label: 'Daily Forms' },
      { href: '/closer/stats', icon: BarChart2,     label: 'My Stats'    },
    ],
  },
]

// ── Role badge colours ────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  super_admin: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  creator:     { bg: 'rgba(37,99,235,0.12)',  color: '#60a5fa' },
  setter:      { bg: 'rgba(16,185,129,0.12)', color: '#34d399' },
  closer:      { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Admin',
  creator:     'Creator',
  setter:      'Setter',
  closer:      'Closer',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(fullName: string | null | undefined, email: string): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

// ── Component ─────────────────────────────────────────────────────────────────

export type SidebarVariant = 'admin' | 'creator' | 'setter' | 'closer'

export interface SidebarUser {
  email: string
  full_name: string | null
  role: string
}

interface SidebarProps {
  variant: SidebarVariant
  user: SidebarUser
  /** Creator display name shown at the top of the sidebar (creator variant only) */
  creatorName?: string
  /** Creator niche badge (creator variant only) */
  creatorNiche?: string
  /** Live unread count for DM Inbox badge (creator variant only) */
  dmUnreadCount?: number
}

export default function Sidebar({
  variant,
  user,
  creatorName,
  creatorNiche,
  dmUnreadCount = 0,
}: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  // ── Nav selection ──────────────────────────────────────────────────────────
  const navSections: NavSection[] = (() => {
    switch (variant) {
      case 'admin':   return ADMIN_NAV
      case 'creator': return creatorNav(dmUnreadCount)
      case 'setter':  return SETTER_NAV
      case 'closer':  return CLOSER_NAV
    }
  })()

  // ── Active detection ───────────────────────────────────────────────────────
  // Root routes (/admin, /dashboard) need exact match only.
  // Everything else matches prefix + trailing slash to avoid false positives.
  function active(href: string): boolean {
    if (href === '/admin' || href === '/dashboard') return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // ── Derived user display ───────────────────────────────────────────────────
  const displayName = user.full_name || user.email.split('@')[0]
  const avatarInitials = initials(user.full_name, user.email)
  const roleLabel = ROLE_LABEL[user.role] ?? user.role
  const badge = ROLE_BADGE[user.role] ?? ROLE_BADGE.creator

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col"
      style={{
        backgroundColor: '#0d1117',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-5">
        {variant === 'creator' && creatorName ? (
          <div className="space-y-1.5">
            <p className="truncate text-[13.5px] font-semibold leading-tight text-[#f9fafb]">
              {creatorName}
            </p>
            {creatorNiche && (
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}
              >
                {creatorNiche}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: 'rgba(37,99,235,0.15)' }}
            >
              <Zap className="h-3.5 w-3.5 fill-current text-[#2563eb]" />
            </div>
            <span className="text-[13.5px] font-semibold tracking-tight text-[#f9fafb]">
              AgencyOS
            </span>
          </div>
        )}
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-5">
          {navSections.map((section) => (
            <div key={section.title}>
              {/* Section label */}
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5563]">
                {section.title}
              </p>

              {/* Items */}
              <div className="space-y-px">
                {section.items.map((item) => {
                  const isActive = active(item.href)
                  const Icon = item.icon

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        // layout
                        'group flex items-center gap-2.5 rounded-lg border-l-2 py-[7px] pl-[10px] pr-2.5',
                        // typography
                        'text-[13px] font-medium transition-colors duration-100',
                        // states
                        isActive
                          ? 'border-l-[#2563eb] bg-[#2563eb]/10 text-[#2563eb]'
                          : 'border-l-transparent text-[#9ca3af] hover:bg-white/5 hover:text-[#e5e7eb]'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors duration-100',
                          isActive
                            ? 'text-[#2563eb]'
                            : 'text-[#9ca3af] group-hover:text-[#e5e7eb]'
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                          style={{ backgroundColor: '#2563eb' }}
                        >
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ── User footer ────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 p-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          {/* Avatar */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ backgroundColor: 'rgba(37,99,235,0.2)', color: '#60a5fa' }}
          >
            {avatarInitials}
          </div>

          {/* Name + role badge */}
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-[12.5px] font-medium leading-tight text-[#f9fafb]">
              {displayName}
            </p>
            <span
              className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-none"
              style={{ backgroundColor: badge.bg, color: badge.color }}
            >
              {roleLabel}
            </span>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 rounded-md p-1.5 text-[#4b5563] transition-colors hover:bg-white/5 hover:text-[#e5e7eb]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
