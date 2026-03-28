import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/page-header'
import TopPostsWidget from './top-posts-widget'
import StoriesThisWeekWidget from './stories-this-week-widget'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let creatorName = ''

  if (user) {
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle()

    creatorName = profile?.name ?? ''
  }

  const firstName = creatorName.trim().split(/\s+/)[0] || 'there'

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what's happening with your brand today."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Top Posts This Week — spans 1 col on mobile, 1 of 3 on xl */}
        <div className="xl:col-span-1">
          <TopPostsWidget />
        </div>

        {/* Stories This Week */}
        <div className="xl:col-span-2">
          <StoriesThisWeekWidget />
        </div>
      </div>
    </div>
  )
}
