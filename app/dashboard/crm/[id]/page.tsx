import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadWithRelations } from '@/types/crm'
import LeadDetailClient from './LeadDetailClient'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const admin = createAdminClient()
  const { data } = await admin.from('leads').select('name').eq('id', params.id).maybeSingle()
  return { title: data?.name ? `${data.name} — CRM` : 'Lead Detail — CRM' }
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Fetch user role
  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = userRow?.role ?? 'creator'

  // Fetch the lead
  const { data: lead, error } = await admin
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !lead) notFound()

  // Access check
  let hasAccess = role === 'super_admin'
  if (!hasAccess && role === 'creator') {
    const { data: profile } = await admin
      .from('creator_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    hasAccess = lead.creator_id === profile?.id
  }
  if (!hasAccess && role === 'setter') hasAccess = lead.assigned_setter_id === user.id
  if (!hasAccess && role === 'closer') hasAccess = lead.assigned_closer_id === user.id

  if (!hasAccess) redirect('/dashboard/crm')

  // Fetch history + notes in parallel
  const [{ data: history }, { data: notes }] = await Promise.all([
    admin
      .from('lead_stage_history')
      .select('*')
      .eq('lead_id', params.id)
      .order('changed_at', { ascending: true }),
    admin
      .from('lead_notes')
      .select('*')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  // Batch-resolve all actor names
  const actorIds = new Set<string>()
  ;(history ?? []).forEach((h) => { if (h.changed_by) actorIds.add(h.changed_by) })
  ;(notes ?? []).forEach((n) => { if (n.author_id) actorIds.add(n.author_id) })
  if (lead.assigned_setter_id) actorIds.add(lead.assigned_setter_id)
  if (lead.assigned_closer_id) actorIds.add(lead.assigned_closer_id)

  let userNames: Record<string, string> = {}
  if (actorIds.size > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id, full_name')
      .in('id', Array.from(actorIds))
    ;(users ?? []).forEach((u) => {
      userNames[u.id as string] = (u.full_name as string | null) ?? 'Unknown'
    })
  }

  const leadWithRelations: LeadWithRelations = {
    ...lead,
    stage_history: history ?? [],
    notes: notes ?? [],
    setter_name: lead.assigned_setter_id
      ? userNames[lead.assigned_setter_id]
      : undefined,
    closer_name: lead.assigned_closer_id
      ? userNames[lead.assigned_closer_id]
      : undefined,
  }

  return <LeadDetailClient initialLead={leadWithRelations} userNames={userNames} />
}
