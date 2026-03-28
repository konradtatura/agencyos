// ============================================================================
// AgencyOS — Content Pipeline Types
// ============================================================================

export type ContentStage =
  | 'idea'
  | 'preparing'
  | 'recorded'
  | 'editing'
  | 'ready_to_post'
  | 'uploaded'

export type ContentPlatform = 'instagram' | 'youtube' | 'both'

export type PlatformFilter = 'all' | ContentPlatform

export interface ContentIdea {
  id: string
  creator_id: string
  title: string
  script: string | null
  platform: ContentPlatform
  stage: ContentStage
  inspiration_url: string | null
  additional_info: string | null
  stage_entered_at: string
  created_at: string
  updated_at: string
}

export type ContentIdeaInsert = {
  title: string
  platform?: ContentPlatform
  stage?: ContentStage
  script?: string | null
  inspiration_url?: string | null
  additional_info?: string | null
}

export type ContentIdeaUpdate = Partial<{
  title: string
  script: string | null
  platform: ContentPlatform
  stage: ContentStage
  inspiration_url: string | null
  additional_info: string | null
  stage_entered_at: string
}>

export interface StageConfig {
  label: string
  color: string
  badgeBg: string
  badgeColor: string
}

export const CONTENT_STAGES: ContentStage[] = [
  'idea',
  'preparing',
  'recorded',
  'editing',
  'ready_to_post',
  'uploaded',
]

export const STAGE_CONFIG: Record<ContentStage, StageConfig> = {
  idea:          { label: 'Idea',               color: '#6b7280', badgeBg: 'rgba(107,114,128,0.12)', badgeColor: '#9ca3af' },
  preparing:     { label: 'Preparing',          color: '#2563eb', badgeBg: 'rgba(37,99,235,0.12)',   badgeColor: '#60a5fa' },
  recorded:      { label: 'Recorded',           color: '#8b5cf6', badgeBg: 'rgba(139,92,246,0.12)', badgeColor: '#a78bfa' },
  editing:       { label: 'Editing',            color: '#f59e0b', badgeBg: 'rgba(245,158,11,0.12)', badgeColor: '#fbbf24' },
  ready_to_post: { label: 'Ready to Post',      color: '#f97316', badgeBg: 'rgba(249,115,22,0.12)', badgeColor: '#fb923c' },
  uploaded:      { label: 'Uploaded',           color: '#10b981', badgeBg: 'rgba(16,185,129,0.12)', badgeColor: '#34d399' },
}

/** Returns the number of whole days since the given ISO date string */
export function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}
