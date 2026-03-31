import type { ContentIdea, PlatformFilter } from './types'
import { CONTENT_STAGES, STAGE_CONFIG, daysSince } from './types'

export interface PipelineExportRow {
  stage: string
  platform: string
  title: string
  script: string
  inspirationLink: string
  additionalInfo: string
  createdAt: string
  daysInCurrentStage: number
}

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

export function exportPipelineCSV(ideas: ContentIdea[], platformFilter: PlatformFilter): void {
  const filtered =
    platformFilter === 'all'
      ? ideas
      : ideas.filter((i) => i.platform === platformFilter)

  const stageOrder = Object.fromEntries(CONTENT_STAGES.map((s, idx) => [s, idx]))

  const sorted = [...filtered].sort((a, b) => {
    const stageDiff = stageOrder[a.stage] - stageOrder[b.stage]
    if (stageDiff !== 0) return stageDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const headers = [
    'Stage',
    'Platform',
    'Title / Hook',
    'Script',
    'Inspiration Link',
    'Additional Info',
    'Created At',
    'Days in Current Stage',
  ]

  const rows = sorted.map((idea) => {
    const platformLabel =
      idea.platform === 'instagram' ? 'Instagram'
      : idea.platform === 'youtube' ? 'YouTube'
      : 'Both'

    return [
      STAGE_CONFIG[idea.stage].label,
      platformLabel,
      idea.title,
      idea.script ?? '',
      idea.inspiration_url ?? '',
      idea.additional_info ?? '',
      idea.created_at.slice(0, 10),
      String(daysSince(idea.stage_entered_at)),
    ].map(escapeCell).join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `content-pipeline-${date}.csv`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
