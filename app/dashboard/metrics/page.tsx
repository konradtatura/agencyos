import MetricsDashboard from './MetricsDashboard'
import { TrendingUp } from 'lucide-react'

export default function MetricsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-[#2563eb]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#f9fafb]">Conversion Metrics</h1>
          <p className="text-sm text-[#9ca3af]">Sales team performance — DMs to close</p>
        </div>
      </div>
      <MetricsDashboard />
    </div>
  )
}
