import { Skeleton } from '@/components/ui/skeleton'

const STAGES = 6

export default function ContentPipelineLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Skeleton style={{ height: 26, width: 200, borderRadius: 6, marginBottom: 8 }} />
          <Skeleton style={{ height: 16, width: 280, borderRadius: 6 }} />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[80, 120, 120].map((w, i) => (
          <Skeleton key={i} style={{ height: 30, width: w, borderRadius: 20 }} />
        ))}
      </div>

      {/* Kanban columns skeleton */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24 }}>
        {Array.from({ length: STAGES }).map((_, col) => (
          <div key={col} style={{ width: 240, minWidth: 240, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Skeleton style={{ height: 14, width: 80, borderRadius: 4 }} />
              <Skeleton style={{ height: 16, width: 24, borderRadius: 10 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} style={{ height: 80, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
