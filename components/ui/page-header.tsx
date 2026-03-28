interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Optional action buttons / controls rendered flush-right */
  children?: React.ReactNode
}

/**
 * Standard section heading used at the top of every page.
 *
 * Usage:
 *   <PageHeader title="Instagram" subtitle="Content & analytics" />
 *   <PageHeader title="CRM"><Button>Add Lead</Button></PageHeader>
 */
export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight text-[#f9fafb]">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[#9ca3af]">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-3">{children}</div>
      )}
    </div>
  )
}
