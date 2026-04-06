// LeadStage and DowngradeStage are now plain strings — values come from
// the pipeline_stages table rather than a hardcoded enum.
export type LeadStage = string
export type DowngradeStage = string

export type OfferTier = 'ht' | 'mt' | 'lt'
export type PipelineType = 'main' | 'downgrade'
export type LeadSourceType = 'story' | 'reel' | 'organic' | 'manual' | 'vsl_funnel'

export interface PipelineStage {
  id: string
  creator_id: string
  pipeline_type: 'main' | 'downgrade'
  name: string
  color: string
  position: number
  is_won: boolean
  is_lost: boolean
  created_at: string
}

export interface Lead {
  id: string
  creator_id: string
  name: string
  ig_handle: string | null
  email: string | null
  phone: string | null
  stage: LeadStage
  offer_tier: OfferTier | null
  pipeline_type: PipelineType
  downgrade_stage: DowngradeStage | null
  assigned_setter_id: string | null
  assigned_closer_id: string | null
  deal_value: number | null
  follow_up_date: string | null
  lead_source_type: LeadSourceType | null
  lead_source_id: string | null
  dm_conversation_id: string | null
  ghl_contact_id: string | null
  tally_answers: Record<string, unknown> | null
  booked_at: string | null
  created_at: string
  updated_at: string
}

export interface LeadStageHistory {
  id: string
  lead_id: string
  from_stage: string | null
  to_stage: string
  changed_by: string | null
  changed_at: string
  note: string | null
}

export interface LeadNote {
  id: string
  lead_id: string
  author_id: string | null
  note_text: string
  created_at: string
}

export interface LeadWithRelations extends Lead {
  stage_history: LeadStageHistory[]
  notes: LeadNote[]
  setter_name?: string
  closer_name?: string
}
