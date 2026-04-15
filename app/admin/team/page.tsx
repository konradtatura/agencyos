import { createAdminClient } from '@/lib/supabase/admin'
import TeamClient from './team-client'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeamMember = {
  id: string
  user_id: string
  creator_id: string
  role: 'setter' | 'closer' | 'sales_admin'
  active: boolean
  created_at: string
  users: { id: string; full_name: string | null; email: string } | null
  creator_profiles: { id: string; name: string } | null
}

export type Creator = {
  id: string
  name: string
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getTeamData(): Promise<{ members: TeamMember[]; creators: Creator[] }> {
  const admin = createAdminClient()

  const [membersRes, creatorsRes] = await Promise.all([
    admin
      .from('team_members')
      .select(`
        id,
        user_id,
        creator_id,
        role,
        active,
        created_at,
        users!team_members_user_id_fkey (
          id,
          full_name,
          email
        ),
        creator_profiles!team_members_creator_id_fkey (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false }),
    admin
      .from('creator_profiles')
      .select('id, name')
      .order('name'),
  ])

  // Supabase returns FK relations as arrays; normalise to single objects.
  const members = (membersRes.data ?? []).map((m) => ({
    ...m,
    users:            Array.isArray(m.users)            ? (m.users[0]            ?? null) : m.users,
    creator_profiles: Array.isArray(m.creator_profiles) ? (m.creator_profiles[0] ?? null) : m.creator_profiles,
  })) as unknown as TeamMember[]

  return {
    members,
    creators: (creatorsRes.data ?? []) as Creator[],
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TeamPage() {
  const { members, creators } = await getTeamData()

  return <TeamClient initialMembers={members} creators={creators} />
}
