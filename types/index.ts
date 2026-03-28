// ============================================================================
// AgencyOS — Database Types
// Hand-written to match supabase/schema.sql.
// Replace with `supabase gen types typescript` once the project is linked.
// ============================================================================

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type UserRole = 'super_admin' | 'creator' | 'setter' | 'closer'
export type TeamRole = 'setter' | 'closer'
export type Platform = 'instagram' | 'youtube' | 'stripe' | 'whop' | 'ghl'
export type IntegrationStatus = 'active' | 'expired' | 'disconnected'

// ---------------------------------------------------------------------------
// Row types — shape returned by SELECT *
// ---------------------------------------------------------------------------

export interface AgencyConfig {
  id: string
  platform_name: string
  logo_url: string | null
  brand_color: string | null
  support_email: string | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface CreatorProfile {
  id: string
  user_id: string
  name: string
  niche: string | null
  logo_url: string | null
  brand_color: string | null
  subdomain: string | null
  onboarding_complete: boolean
  onboarding_step: number
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  creator_id: string
  user_id: string
  role: TeamRole
  active: boolean
  created_at: string
  updated_at: string
}

export interface Integration {
  id: string
  creator_id: string
  platform: Platform
  /** Encrypted at the application layer before storage. */
  access_token: string | null
  /** Encrypted at the application layer before storage. */
  refresh_token: string | null
  expires_at: string | null
  meta: Record<string, unknown>
  status: IntegrationStatus
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Insert types — what you pass when creating a new row.
// Generated columns (id, created_at, updated_at) are optional.
// ---------------------------------------------------------------------------

export type AgencyConfigInsert = Omit<AgencyConfig, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type UserInsert = Omit<User, 'created_at' | 'updated_at'>

export type CreatorProfileInsert = Omit<CreatorProfile, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type TeamMemberInsert = Omit<TeamMember, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type IntegrationInsert = Omit<Integration, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}

// ---------------------------------------------------------------------------
// Update types — partial of the mutable columns (no id / timestamps).
// ---------------------------------------------------------------------------

export type AgencyConfigUpdate = Partial<
  Omit<AgencyConfig, 'id' | 'created_at' | 'updated_at'>
>

export type UserUpdate = Partial<
  Omit<User, 'id' | 'created_at' | 'updated_at'>
>

export type CreatorProfileUpdate = Partial<
  Omit<CreatorProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>

export type TeamMemberUpdate = Partial<
  Omit<TeamMember, 'id' | 'creator_id' | 'user_id' | 'created_at' | 'updated_at'>
>

export type IntegrationUpdate = Partial<
  Omit<Integration, 'id' | 'creator_id' | 'platform' | 'created_at' | 'updated_at'>
>

// ---------------------------------------------------------------------------
// Join / view types — convenience shapes for common query patterns
// ---------------------------------------------------------------------------

/** User row with their creator profile attached (for creator-role users). */
export type UserWithCreatorProfile = User & {
  creator_profile: CreatorProfile | null
}

/** Team member row with the linked user's public fields. */
export type TeamMemberWithUser = TeamMember & {
  user: Pick<User, 'id' | 'email' | 'full_name' | 'avatar_url' | 'role'>
}

/** Creator profile with its full team. */
export type CreatorProfileWithTeam = CreatorProfile & {
  team_members: TeamMemberWithUser[]
}
