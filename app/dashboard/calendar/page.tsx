import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import CalendarView from './calendar-view'

export default async function CalendarPage() {
  const creatorId = await getCreatorId()

  type LeadRow = {
    id:                  string
    name:                string
    ig_handle:           string | null
    stage:               string
    offer_tier:          string | null
    booked_at:           string
    deal_value:          number | null
    assigned_closer_id:  string | null
    closer:              { full_name: string | null } | null
  }

  let leads: LeadRow[] = []

  if (creatorId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('leads')
      .select('id, name, ig_handle, stage, offer_tier, booked_at, deal_value, assigned_closer_id, closer:users!assigned_closer_id(full_name)')
      .eq('creator_id', creatorId)
      .not('booked_at', 'is', null)
      .order('booked_at', { ascending: true })

    leads = (data ?? []) as LeadRow[]
  }

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Booked calls and appointments." />
      <CalendarView leads={leads} />
    </div>
  )
}
