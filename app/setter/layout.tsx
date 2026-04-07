import { redirect } from 'next/navigation'
import Sidebar from '@/components/nav/sidebar'
import { getSessionUser } from '@/lib/get-session-user'

export default async function SetterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  if (!user) redirect('/login')
  if (user.role !== 'setter' && user.role !== 'super_admin') redirect('/dashboard')

  return (
    <div>
      <Sidebar
        variant="setter"
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
