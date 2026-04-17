import { redirect } from 'next/navigation'
import Sidebar from '@/components/nav/sidebar'
import { getSessionUser } from '@/lib/get-session-user'

export default async function CloserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  if (!user) redirect('/login')
  if (user.role !== 'closer' && user.role !== 'super_admin' && user.role !== 'creator') redirect('/dashboard')

  return (
    <div>
      <Sidebar
        variant="closer"
        user={{
          email:     user.email,
          full_name: user.full_name,
          role:      user.role,
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
