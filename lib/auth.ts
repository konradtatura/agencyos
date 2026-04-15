export type Role = 'super_admin' | 'creator' | 'setter' | 'closer' | 'sales_admin'

/**
 * Where each role lands after login or when redirected away from an
 * unauthorized route.
 */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: '/admin',
  creator:     '/dashboard',
  setter:      '/setter/dms',
  closer:      '/closer/crm',
  sales_admin: '/sales-admin/forms',
}

/**
 * Routes that are fully public — no session required.
 */
export const PUBLIC_ROUTES = [
  '/login',
  '/auth/callback',
  '/auth/reset-password',
]

/**
 * Route prefixes that require an authenticated session.
 */
export const PROTECTED_PREFIXES = [
  '/admin',
  '/dashboard',
  '/setter',
  '/closer',
  '/sales-admin',
  '/onboarding',
]

/**
 * Extract the role from a Supabase user.
 *
 * Roles are set in `app_metadata` via the service-role key during user
 * creation — they cannot be modified by the end user, making this safe to
 * trust inside middleware without an extra DB round-trip.
 */
export function getRoleFromUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: { app_metadata?: Record<string, any>; user_metadata?: Record<string, any> } | null
): Role | null {
  if (!user) return null
  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (isRole(role)) return role
  return null
}

export function isRole(value: unknown): value is Role {
  return (
    value === 'super_admin' ||
    value === 'creator' ||
    value === 'setter' ||
    value === 'closer' ||
    value === 'sales_admin'
  )
}

export function roleHome(role: Role | null): string {
  return role ? ROLE_HOME[role] : '/dashboard'
}
