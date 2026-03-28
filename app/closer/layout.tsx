import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/nav/sidebar'

export default async function CloserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = user.app_metadata?.role ?? user.user_metadata?.role
  if (role !== 'closer' && role !== 'super_admin') redirect('/dashboard')

  return (
    <div>
      <Sidebar
        variant="closer"
        user={{
          email:     user.email!,
          full_name: user.user_metadata?.full_name ?? null,
          role:      role ?? 'closer',
        }}
      />
      <main
        style={{
          marginLeft:      '240px',
          minHeight:       '100vh',
          backgroundColor: '#0a0f1e',
          padding:         '32px',
        }}
      >
        {children}
      </main>
    </div>
  )
}
