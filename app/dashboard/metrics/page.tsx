import MetricsDashboard from './MetricsDashboard'
import TrackingScriptPanel from './TrackingScriptPanel'
import { TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getLocationId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('creator_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile) return null

    const { data: integration } = await admin
      .from('integrations')
      .select('ghl_location_id')
      .eq('creator_id', profile.id)
      .maybeSingle()

    return (integration?.ghl_location_id as string | null) ?? null
  } catch {
    return null
  }
}

export default async function MetricsPage() {
  const locationId = await getLocationId()

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-[#2563eb]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#f9fafb]">Conversion Metrics</h1>
          <p className="text-sm text-[#9ca3af]">Full-funnel performance — pages to close</p>
        </div>
      </div>

      <TrackingScriptPanel locationId={locationId} />
      <MetricsDashboard />
    </div>
  )
}
