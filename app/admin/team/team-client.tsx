'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, ChevronDown, Users, Loader2, Search } from 'lucide-react'
import type { TeamMember, Creator } from './page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  })
}

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

const AVATAR_PALETTE = [
  { bg: 'rgba(37,99,235,0.2)',   text: '#60a5fa' },
  { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
  { bg: 'rgba(16,185,129,0.2)', text: '#34d399' },
  { bg: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
  { bg: 'rgba(236,72,153,0.2)', text: '#f472b6' },
]

function avatarColors(seed: string) {
  return AVATAR_PALETTE[seed.charCodeAt(0) % AVATAR_PALETTE.length]
}

// ── Shared styled inputs ──────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-lg px-3 py-2.5 text-[13px] text-[#f9fafb] outline-none placeholder:text-[#4b5563] focus:ring-1 focus:ring-[#2563eb] transition-colors'
const INPUT_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
}
const LABEL_CLASS = 'mb-1.5 block text-[12.5px] font-medium text-[#9ca3af]'

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: 'setter' | 'closer' | 'sales_admin' }) {
  const styles = {
    setter:      { bg: 'rgba(37,99,235,0.12)',   color: '#60a5fa' },
    closer:      { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
    sales_admin: { bg: 'rgba(236,72,153,0.12)', color: '#f472b6' },
  }
  const s = styles[role]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {role}
    </span>
  )
}

// ── Status toggle ─────────────────────────────────────────────────────────────

function StatusToggle({
  memberId,
  userId,
  active,
  onToggled,
}: {
  memberId: string
  userId: string
  active: boolean
  onToggled: (userId: string, newActive: boolean) => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/team/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: !active }),
      })
      if (res.ok) onToggled(userId, !active)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="flex items-center gap-2 transition-opacity disabled:opacity-50"
      title={active ? 'Click to deactivate' : 'Click to activate'}
    >
      {/* Track */}
      <div
        className="relative h-5 w-9 rounded-full transition-colors"
        style={{ backgroundColor: active ? '#2563eb' : 'rgba(255,255,255,0.1)' }}
      >
        {/* Thumb */}
        <div
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
          style={{ transform: active ? 'translateX(16px)' : 'translateX(2px)' }}
        />
      </div>
      <span
        className="text-[12px] font-medium"
        style={{ color: active ? '#34d399' : '#6b7280' }}
      >
        {loading ? '…' : active ? 'Active' : 'Inactive'}
      </span>
    </button>
  )
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({
  creators,
  onClose,
  onInvited,
}: {
  creators: Creator[]
  onClose: () => void
  onInvited: () => void
}) {
  const [fullName,   setFullName]   = useState('')
  const [email,      setEmail]      = useState('')
  const [role,       setRole]       = useState<'setter' | 'closer' | 'sales_admin' | ''>('')
  const [creatorId,  setCreatorId]  = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) { setError('Please select a role'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/team', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, full_name: fullName, role, creator_id: creatorId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Something went wrong'); return }
      setSuccess(true)
      setTimeout(() => {
        onInvited()
        onClose()
      }, 1200)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-5"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div>
            <h2 className="text-[15px] font-semibold text-[#f9fafb]">Invite Team Member</h2>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">
              Sends an invite email. They set their password on first login.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Full name */}
          <div>
            <label className={LABEL_CLASS}>
              Full Name <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="text"
              required
              autoComplete="off"
              placeholder="e.g. James Carter"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          {/* Email */}
          <div>
            <label className={LABEL_CLASS}>
              Email Address <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="email"
              required
              autoComplete="off"
              placeholder="james@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </div>

          {/* Role */}
          <div>
            <label className={LABEL_CLASS}>
              Role <span className="text-[#ef4444]">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={role}
                onChange={(e) => setRole(e.target.value as 'setter' | 'closer' | 'sales_admin')}
                disabled={loading}
                className={`${INPUT_CLASS} appearance-none pr-9`}
                style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
              >
                <option value="">Select a role…</option>
                <option value="setter">Setter</option>
                <option value="closer">Closer</option>
                <option value="sales_admin">Sales Admin</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
            </div>
          </div>

          {/* Assigned creator */}
          <div>
            <label className={LABEL_CLASS}>
              Assigned Creator <span className="text-[#ef4444]">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
                disabled={loading}
                className={`${INPUT_CLASS} appearance-none pr-9`}
                style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
              >
                <option value="">Select a creator…</option>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              className="rounded-lg px-3 py-2.5 text-[12px] text-[#f87171]"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              {error}
            </p>
          )}

          {/* Success */}
          {success && (
            <p
              className="rounded-lg px-3 py-2.5 text-[12px] text-[#34d399]"
              style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)' }}
            >
              Invite sent! Refreshing…
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl py-2.5 text-[13px] font-medium text-[#9ca3af] transition-colors hover:text-[#f9fafb] disabled:opacity-50"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2563eb' }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Inviting…</>
                : 'Send Invite'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export default function TeamClient({
  initialMembers,
  creators,
}: {
  initialMembers: TeamMember[]
  creators:       Creator[]
}) {
  const router = useRouter()
  const [members,       setMembers]       = useState<TeamMember[]>(initialMembers)
  const [showInvite,    setShowInvite]    = useState(false)
  const [roleFilter,    setRoleFilter]    = useState<'all' | 'setter' | 'closer' | 'sales_admin'>('all')
  const [creatorFilter, setCreatorFilter] = useState<string>('all')
  const [search,        setSearch]        = useState('')

  function handleToggled(userId: string, newActive: boolean) {
    setMembers((prev) =>
      prev.map((m) => m.user_id === userId ? { ...m, active: newActive } : m)
    )
  }

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false
      if (creatorFilter !== 'all' && m.creator_id !== creatorFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const name  = m.users?.full_name?.toLowerCase() ?? ''
        const email = m.users?.email?.toLowerCase() ?? ''
        if (!name.includes(q) && !email.includes(q)) return false
      }
      return true
    })
  }, [members, roleFilter, creatorFilter, search])

  const setterCount      = members.filter((m) => m.role === 'setter').length
  const closerCount      = members.filter((m) => m.role === 'closer').length
  const salesAdminCount  = members.filter((m) => m.role === 'sales_admin').length
  const activeCount      = members.filter((m) => m.active).length

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#f9fafb]">Team</h1>
          <p className="mt-1 text-[13px] text-[#6b7280]">
            Manage setters and closers across all creator workspaces
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <UserPlus className="h-4 w-4" />
          Invite Team Member
        </button>
      </div>

      {/* Stat pills */}
      <div className="mb-6 flex flex-wrap gap-3">
        {[
          { label: 'Total Members', value: members.length,    color: '#9ca3af' },
          { label: 'Setters',       value: setterCount,       color: '#60a5fa' },
          { label: 'Closers',       value: closerCount,       color: '#a78bfa' },
          { label: 'Sales Admins',  value: salesAdminCount,   color: '#f472b6' },
          { label: 'Active',        value: activeCount,       color: '#34d399' },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5"
            style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="font-mono text-[18px] font-bold" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[12px] text-[#6b7280]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)', width: 220 }}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-[#4b5563]" />
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-[13px] text-[#f9fafb] outline-none placeholder:text-[#4b5563]"
          />
        </div>

        {/* Role filter */}
        <div
          className="flex items-center gap-0.5 rounded-xl p-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {(['all', 'setter', 'closer', 'sales_admin'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition-all"
              style={
                roleFilter === r
                  ? { backgroundColor: 'rgba(37,99,235,0.25)', color: '#60a5fa' }
                  : { color: '#6b7280' }
              }
            >
              {r === 'all' ? 'All Roles' : r === 'sales_admin' ? 'Sales Admin' : r}
            </button>
          ))}
        </div>

        {/* Creator filter */}
        <div className="relative">
          <select
            value={creatorFilter}
            onChange={(e) => setCreatorFilter(e.target.value)}
            className="h-9 appearance-none rounded-xl py-0 pl-3 pr-8 text-[12px] font-medium text-[#9ca3af] outline-none focus:ring-1 focus:ring-[#2563eb]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              colorScheme: 'dark',
            }}
          >
            <option value="all">All Creators</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]" />
        </div>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 h-8 w-8 text-[#374151]" />
            <p className="text-[14px] font-medium text-[#6b7280]">No team members found</p>
            {members.length === 0 && (
              <p className="mt-1 text-[12px] text-[#4b5563]">
                Click &ldquo;Invite Team Member&rdquo; to add your first setter or closer.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Member', 'Role', 'Assigned Creator', 'Status', 'Date Added'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4b5563]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {filtered.map((member) => {
                  const name     = member.users?.full_name ?? null
                  const email    = member.users?.email ?? '—'
                  const initials = getInitials(name, email)
                  const colors   = avatarColors(email)
                  const creator  = member.creator_profiles?.name ?? '—'

                  return (
                    <tr
                      key={member.id}
                      className="transition-colors hover:bg-white/[0.02]"
                    >
                      {/* Member */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-[#f9fafb]">
                              {name ?? email}
                            </p>
                            {name && (
                              <p className="truncate text-[11px] text-[#6b7280]">{email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <RoleBadge role={member.role} />
                      </td>

                      {/* Creator */}
                      <td className="px-5 py-4">
                        <span className="text-[13px] text-[#9ca3af]">{creator}</span>
                      </td>

                      {/* Status toggle */}
                      <td className="px-5 py-4">
                        <StatusToggle
                          memberId={member.id}
                          userId={member.user_id}
                          active={member.active}
                          onToggled={handleToggled}
                        />
                      </td>

                      {/* Date added */}
                      <td className="px-5 py-4">
                        <span className="text-[12px] text-[#6b7280]">{formatDate(member.created_at)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          creators={creators}
          onClose={() => setShowInvite(false)}
          onInvited={() => router.refresh()}
        />
      )}
    </div>
  )
}
