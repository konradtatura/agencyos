'use client'

import PageHeader from '@/components/ui/page-header'
import KanbanBoard from '@/components/content-pipeline/KanbanBoard'

export default function ContentPipelinePage() {
  return (
    <>
      <PageHeader
        title="Content Pipeline"
        subtitle="Manage your video ideas from concept to upload"
      />
      <KanbanBoard />
    </>
  )
}
