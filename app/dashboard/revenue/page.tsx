import PageHeader from '@/components/ui/page-header'
import RevenueView from './revenue-view'

export default function RevenuePage() {
  return (
    <div>
      <PageHeader title="Revenue" subtitle="Track sales, products, and revenue metrics." />
      <div className="mt-8">
        <RevenueView />
      </div>
    </div>
  )
}
