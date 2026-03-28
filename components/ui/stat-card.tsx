import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  /** Formatted value string (e.g. "$12,400" or "67%") or raw number */
  value: string | number
  /**
   * Week-over-week or period change as a percentage.
   * Positive → green up arrow, negative → red down arrow, zero → gray dash.
   */
  change?: number
  /** Contextual label next to the change, e.g. "vs last week" */
  changeLabel?: string
  /** Optional Lucide icon rendered in the top-right corner */
  icon?: LucideIcon
  /** Render skeleton placeholders instead of real data */
  loading?: boolean
  className?: string
}

export default function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  loading = false,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <div
        className={cn('rounded-xl p-5', className)}
        style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Skeleton className="mb-4 h-3.5 w-24 bg-white/[0.06]" />
        <Skeleton className="mb-3 h-8 w-32 bg-white/[0.06]" />
        <Skeleton className="h-3 w-20 bg-white/[0.06]" />
      </div>
    )
  }

  const hasChange  = change !== undefined
  const isPositive = hasChange && change! > 0
  const isNegative = hasChange && change! < 0

  return (
    <div
      className={cn('rounded-xl p-5', className)}
      style={{
        backgroundColor: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Title row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-[#9ca3af]">{title}</span>
        {Icon && (
          <div
            className="shrink-0 rounded-lg p-1.5"
            style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}
          >
            <Icon className="h-4 w-4 text-[#2563eb]" />
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mb-2 font-mono text-[28px] font-semibold leading-none tracking-tight text-[#f9fafb]">
        {value}
      </div>

      {/* Change indicator */}
      {hasChange && (
        <div className="flex items-center gap-1.5">
          {isPositive && <TrendingUp  className="h-3.5 w-3.5 shrink-0 text-[#10b981]" />}
          {isNegative && <TrendingDown className="h-3.5 w-3.5 shrink-0 text-[#ef4444]" />}
          {!isPositive && !isNegative && <Minus className="h-3.5 w-3.5 shrink-0 text-[#4b5563]" />}

          <span
            className={cn(
              'text-[12px] font-medium tabular-nums',
              isPositive && 'text-[#10b981]',
              isNegative && 'text-[#ef4444]',
              !isPositive && !isNegative && 'text-[#4b5563]'
            )}
          >
            {isPositive ? '+' : ''}{change}%
          </span>

          {changeLabel && (
            <span className="text-[12px] text-[#4b5563]">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
