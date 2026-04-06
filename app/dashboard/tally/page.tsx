'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Copy, RefreshCw, Check, Settings, Eye, MousePointer,
  CheckCircle, TrendingUp, ArrowDown, Search, UserPlus,
  ExternalLink, Download, ChevronDown, ChevronUp, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/ui/page-header'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TallyFormBasic {
  id: string
  tally_form_id: string
  name: string | null
  workspace_name: string | null
  total_submissions: number
  last_synced_at: string | null
  is_qualification_form: boolean
}

interface TallyQuestion {
  id: string
  title?: string
  type?: string
  numberOfResponses?: number
}

interface TallySubmission {
  id: string
  tally_submission_id: string
  respondent_name: string | null
  respondent_phone: string | null
  respondent_ig_handle: string | null
  answers: Record<string, unknown> | null
  submitted_at: string | null
  lead_id: string | null
  is_completed: boolean | null
}

interface FormDetail {
  id: string
  tally_form_id: string
  name: string | null
  workspace_name: string | null
  total_submissions: number
  completed_submissions: number
  partial_submissions: number
  is_qualification_form: boolean
  questions: TallyQuestion[] | null
}

interface TallyInsights {
  questions: TallyQuestion[]
  counts: { all: number; completed: number; partial: number }
}

interface BudgetOption {
  label: string
  count: number
  pct: number
  color: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function strAnswer(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '…' : str
}

const BUDGET_KEYWORDS = [
  'budget', 'invest', 'spend', 'afford', 'price', 'cost',
  'płacić', 'budżet', 'inwestować', 'wydać', 'kwota', 'zainwestować',
]

function findBudgetQuestion(questions: TallyQuestion[]): TallyQuestion | null {
  const qs = questions.filter((q) => q.title)
  if (qs.length === 0) return null
  const match = qs.find((q) => {
    const t = q.title!.toLowerCase()
    return BUDGET_KEYWORDS.some((kw) => t.includes(kw))
  })
  return match ?? qs[qs.length - 1]
}

function extractFirstNumber(text: string): number {
  const m = text.match(/\d[\d\s,.']*/)
  if (!m) return NaN
  return parseFloat(m[0].replace(/[\s,']/g, ''))
}

function exportCSV(
  submissions: TallySubmission[],
  budgetQuestion: TallyQuestion | null,
  formName: string,
) {
  const headers = ['Name', 'IG Handle', 'Submitted', 'Completed', 'Budget Answer']
  const rows = submissions.map((sub) => {
    const budget = budgetQuestion?.title
      ? strAnswer((sub.answers ?? {})[budgetQuestion.title])
      : ''
    const completed =
      sub.is_completed === true ? 'Yes' : sub.is_completed === false ? 'No' : ''
    return [
      sub.respondent_name ?? '',
      sub.respondent_ig_handle ? `@${sub.respondent_ig_handle}` : '',
      sub.submitted_at ?? '',
      completed,
      budget,
    ]
  })
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${formName}-submissions.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Webhook card ──────────────────────────────────────────────────────────────

function WebhookCard() {
  const [copied, setCopied] = useState(false)
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/tally`

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="mb-6 rounded-xl p-4"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-[#6b7280]">
        Webhook URL
      </p>
      <div className="flex items-center gap-3">
        <code
          className="flex-1 truncate rounded-lg px-3 py-2 font-mono text-[12.5px] text-[#a5f3fc]"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {url}
        </code>
        <button
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
          style={{
            backgroundColor: copied ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)',
            color: copied ? '#34d399' : '#9ca3af',
            border: copied ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-[#6b7280]">
        Paste this into each form&apos;s settings in Tally under{' '}
        <span className="text-[#9ca3af]">Integrations → Webhook</span>
      </p>
    </div>
  )
}

// ── Form selector pills ───────────────────────────────────────────────────────

function FormPills({
  forms,
  selectedId,
  onSelect,
  onToggleQualification,
}: {
  forms: TallyFormBasic[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleQualification: (formId: string, value: boolean) => void
}) {
  const [openGearId, setOpenGearId] = useState<string | null>(null)

  useEffect(() => {
    if (!openGearId) return
    function handle(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-gear-area]')) {
        setOpenGearId(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [openGearId])

  if (forms.length === 0) {
    return (
      <div
        className="mb-6 rounded-xl py-12 text-center"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-[13px] text-[#6b7280]">No forms assigned to your account</p>
        <p className="mt-1 text-[11.5px] text-[#4b5563]">
          Contact your admin to assign Tally forms
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {forms.map((form) => {
        const isActive = form.id === selectedId
        const isGearOpen = openGearId === form.id

        return (
          <div key={form.id} className="relative" data-gear-area>
            <div
              className="flex items-center overflow-hidden rounded-xl"
              style={{
                backgroundColor: isActive
                  ? 'rgba(37,99,235,0.12)'
                  : 'rgba(255,255,255,0.03)',
                border: isActive
                  ? '1px solid rgba(37,99,235,0.3)'
                  : '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.12s',
              }}
            >
              <button
                onClick={() => onSelect(form.id)}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span
                  className="text-[13px] font-medium"
                  style={{ color: isActive ? '#93c5fd' : '#9ca3af' }}
                >
                  {form.name ?? form.tally_form_id}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold"
                  style={{
                    backgroundColor: isActive
                      ? 'rgba(37,99,235,0.2)'
                      : 'rgba(255,255,255,0.06)',
                    color: isActive ? '#60a5fa' : '#6b7280',
                  }}
                >
                  {form.total_submissions}
                </span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenGearId(isGearOpen ? null : form.id)
                }}
                className="flex h-full items-center px-2 transition-colors hover:bg-white/5"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
                title="Form settings"
              >
                <Settings className="h-3 w-3 text-[#4b5563]" />
              </button>
            </div>

            {isGearOpen && (
              <div
                className="absolute left-0 top-full z-20 mt-1.5 rounded-xl p-3"
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  minWidth: '220px',
                }}
              >
                <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-[#4b5563]">
                  Form Settings
                </p>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[12.5px] font-medium text-[#d1d5db]">
                      Qualification form
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6b7280]">
                      Auto-creates CRM leads
                    </p>
                  </div>
                  <Switch
                    checked={form.is_qualification_form}
                    onCheckedChange={(v) => {
                      onToggleQualification(form.id, v)
                      setOpenGearId(null)
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent?: string
}) {
  const color = accent ?? '#6b7280'
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-4"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-[#6b7280]">
          {label}
        </span>
        <div className="rounded-lg p-1.5" style={{ backgroundColor: `${color}1a` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
      </div>
      <span className="font-mono text-[26px] font-semibold leading-none text-[#f9fafb]">
        {value}
      </span>
      {sub && <span className="text-[11px] text-[#4b5563]">{sub}</span>}
    </div>
  )
}

// ── Funnel components ─────────────────────────────────────────────────────────

function FunnelVLine() {
  return (
    <div className="flex justify-center">
      <div className="h-8 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

function FunnelNode({
  icon: Icon, iconBg, iconColor, value, label, valueColor = '#f9fafb', note,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  value: string | number
  label: string
  valueColor?: string
  note?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg, border: `1px solid ${iconColor}40` }}
      >
        <Icon className="h-4 w-4" style={{ color: iconColor }} />
      </div>
      <span
        className="font-mono text-[26px] font-bold leading-none"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <span className="text-center text-[12.5px] text-[#9ca3af]">{label}</span>
      {note && (
        <span className="mt-0.5 text-center text-[11px] text-[#4b5563]">{note}</span>
      )}
    </div>
  )
}

function FunnelDropConnector({ count, pct }: { count: number; pct: number }) {
  const hasDrops = count > 0
  const color = hasDrops ? '#ef4444' : '#4b5563'
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <div className="h-4 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
      <div className="flex items-center gap-1.5">
        <ArrowDown className="h-3.5 w-3.5" style={{ color }} />
        {hasDrops && (
          <span className="font-mono text-[15px] font-bold" style={{ color }}>
            {pct}%
          </span>
        )}
      </div>
      <span className="text-[12px] font-medium" style={{ color }}>
        {hasDrops ? `${count} drop-off${count !== 1 ? 's' : ''}` : 'No drop-offs'}
      </span>
      <div className="h-4 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

function DropoffFunnel({
  questions,
  total,
  completed,
}: {
  questions: TallyQuestion[]
  total: number
  completed: number
}) {
  if (!questions.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-[#6b7280]">
          No question data — run a sync to populate funnel analytics
        </p>
      </div>
    )
  }

  const q1Responses = questions[0]?.numberOfResponses ?? 0
  const dropBeforeStart = Math.max(0, total - q1Responses)
  const dropBeforePct = total > 0 ? Math.round((dropBeforeStart / total) * 100) : 0

  return (
    <div className="mx-auto max-w-2xl pt-4">
      <FunnelNode
        icon={Eye}
        iconBg="rgba(107,114,128,0.1)"
        iconColor="#6b7280"
        value={total}
        label="Form views"
        note="Not available — tracked by Tally only"
      />

      <FunnelDropConnector count={dropBeforeStart} pct={dropBeforePct} />

      <FunnelNode
        icon={MousePointer}
        iconBg="rgba(37,99,235,0.1)"
        iconColor="#2563eb"
        value={q1Responses}
        label="Respondents started answering"
        valueColor="#2563eb"
      />

      <FunnelVLine />

      {questions.map((q, i) => {
        const responses = q.numberOfResponses ?? 0
        const barPct = q1Responses > 0 ? Math.round((responses / q1Responses) * 100) : 0
        const prevR = i > 0 ? (questions[i - 1]?.numberOfResponses ?? q1Responses) : q1Responses
        const dropoff = Math.max(0, prevR - responses)
        const dropPct = prevR > 0 ? Math.round((dropoff / prevR) * 100) : 0
        const hasDropoff = i > 0 && dropoff > 0

        return (
          <div key={q.id}>
            {i > 0 && <FunnelVLine />}
            <div className="py-2">
              <p
                className="mb-3 text-center text-[13px] font-medium leading-snug text-[#d1d5db]"
                title={q.title}
              >
                {truncate(q.title ?? q.id, 80)}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-[72px] shrink-0 text-right">
                  <span className="text-[11.5px] text-[#6b7280]">{prevR} views</span>
                </div>
                <div className="flex flex-1 items-center">
                  <div
                    className="flex h-10 items-center justify-center rounded-lg px-3 transition-all duration-700"
                    style={{
                      width: `${Math.max(barPct, responses > 0 ? 10 : 2)}%`,
                      minWidth: responses > 0 ? '72px' : '4px',
                      backgroundColor: 'rgba(37,99,235,0.13)',
                      border: '1px solid rgba(37,99,235,0.2)',
                    }}
                  >
                    <span className="whitespace-nowrap text-[13px] font-semibold text-[#2563eb]">
                      {responses}
                      {barPct > 18 && (
                        <span className="ml-1 font-normal text-[#60a5fa]">Answers</span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="w-[120px] shrink-0">
                  {i === 0 || !hasDropoff ? (
                    <span className="text-[11.5px] text-[#4b5563]">— No drop-offs</span>
                  ) : (
                    <span className="text-[11.5px] font-medium" style={{ color: '#ef4444' }}>
                      ↓ {dropPct}% · {dropoff} drop-off{dropoff !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <FunnelVLine />

      <FunnelNode
        icon={CheckCircle}
        iconBg="rgba(16,185,129,0.1)"
        iconColor="#10b981"
        value={completed}
        label="Respondents completed the form"
        valueColor="#10b981"
      />
    </div>
  )
}

// ── Budget breakdown ──────────────────────────────────────────────────────────

function BudgetBreakdown({
  question,
  options,
  completedCount,
  answeredCount,
}: {
  question: TallyQuestion
  options: BudgetOption[]
  completedCount: number
  answeredCount: number
}) {
  const maxCount = options.length > 0 ? Math.max(...options.map((o) => o.count)) : 1

  return (
    <div
      className="mb-6 rounded-xl p-5"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#6b7280]" />
            <span className="text-[14px] font-semibold text-[#f9fafb]">Budget Breakdown</span>
          </div>
          <p className="text-[11.5px] text-[#6b7280]" title={question.title}>
            {truncate(question.title ?? '', 80)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-[20px] font-semibold text-[#f9fafb]">
            {answeredCount}
          </span>
          <span className="text-[11.5px] text-[#6b7280]"> / {completedCount}</span>
          <p className="mt-0.5 text-[11px] text-[#4b5563]">completed answered</p>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-[#4b5563]">
          No completed submissions with budget answers yet
        </p>
      ) : (
        <div className="space-y-3">
          {options.map((opt) => (
            <div key={opt.label}>
              <div className="mb-1.5 flex items-center justify-between gap-4">
                <span
                  className="text-[12.5px] font-medium text-[#d1d5db]"
                  title={opt.label}
                >
                  {truncate(opt.label, 60)}
                </span>
                <span
                  className="shrink-0 font-mono text-[12px]"
                  style={{ color: `${opt.color}cc` }}
                >
                  {opt.count} — {opt.pct}%
                </span>
              </div>
              <div
                className="h-7 w-full overflow-hidden rounded-lg"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <div
                  className="h-full rounded-lg transition-all duration-700"
                  style={{
                    width: maxCount > 0 ? `${(opt.count / maxCount) * 100}%` : '0%',
                    minWidth: opt.count > 0 ? '36px' : '0px',
                    backgroundColor: `${opt.color}22`,
                    border: `1px solid ${opt.color}44`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ isCompleted }: { isCompleted: boolean | null }) {
  if (isCompleted === true) {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
        style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
      >
        Completed
      </span>
    )
  }
  if (isCompleted === false) {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
        style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}
      >
        Partial
      </span>
    )
  }
  return <span className="text-[12px] text-[#4b5563]">—</span>
}

// ── Submissions table ─────────────────────────────────────────────────────────

function SubmissionsTable({
  submissions,
  budgetQuestion,
  formName,
  onLeadCreated,
}: {
  submissions: TallySubmission[]
  budgetQuestion: TallyQuestion | null
  formName: string
  onLeadCreated: (subId: string, leadId: string) => void
}) {
  const [search, setSearch]       = useState('')
  const [sortDesc, setSortDesc]   = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let subs = [...submissions]
    if (search.trim()) {
      const q = search.toLowerCase()
      subs = subs.filter(
        (s) =>
          s.respondent_name?.toLowerCase().includes(q) ||
          s.respondent_ig_handle?.toLowerCase().includes(q),
      )
    }
    subs.sort((a, b) => {
      const ta = a.submitted_at ?? ''
      const tb = b.submitted_at ?? ''
      return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb)
    })
    return subs
  }, [submissions, search, sortDesc])

  async function createLead(subId: string) {
    setCreatingId(subId)
    try {
      const res = await fetch(`/api/tally/submissions/${subId}/create-lead`, {
        method: 'POST',
      })
      const data = (await res.json()) as { lead_id?: string }
      if (res.ok && data.lead_id) onLeadCreated(subId, data.lead_id)
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <div>
      {/* Section header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div>
          <span className="text-[14px] font-semibold text-[#f9fafb]">Submissions</span>
          <span className="ml-2 font-mono text-[12px] text-[#6b7280]">
            {submissions.length} total
          </span>
        </div>

        {/* Search */}
        <div
          className="relative flex items-center"
          style={{ minWidth: '200px', maxWidth: '300px', flex: 1 }}
        >
          <Search
            className="absolute left-2.5 h-3.5 w-3.5 text-[#4b5563]"
            style={{ pointerEvents: 'none' }}
          />
          <input
            type="text"
            placeholder="Search name or IG handle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg py-1.5 pl-8 pr-3 text-[12.5px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        </div>

        <button
          onClick={() => exportCSV(filtered, budgetQuestion, formName)}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-xl py-12"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[13px] text-[#4b5563]">
            {search ? 'No submissions match your search' : 'No submissions yet'}
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    { label: 'Name',   w: undefined },
                    { label: 'IG Handle', w: undefined },
                    { label: 'Submitted', w: '140px', sortable: true },
                    { label: 'Status', w: '100px' },
                    { label: budgetQuestion
                        ? truncate(budgetQuestion.title ?? 'Budget', 28)
                        : 'Budget', w: undefined },
                    { label: 'Lead', w: '120px' },
                  ].map(({ label, w, sortable }) => (
                    <th
                      key={label}
                      className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#6b7280]"
                      style={{
                        width: w,
                        cursor: sortable ? 'pointer' : undefined,
                        userSelect: sortable ? 'none' : undefined,
                        backgroundColor: '#0d1117',
                      }}
                      onClick={sortable ? () => setSortDesc((v) => !v) : undefined}
                    >
                      {label}
                      {sortable && (
                        <span className="ml-1 opacity-50">
                          {sortDesc ? '↓' : '↑'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub, ri) => {
                  const budgetAns = budgetQuestion?.title
                    ? strAnswer((sub.answers ?? {})[budgetQuestion.title])
                    : ''

                  return (
                    <tr
                      key={sub.id}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{
                        borderBottom:
                          ri < filtered.length - 1
                            ? '1px solid rgba(255,255,255,0.04)'
                            : 'none',
                      }}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <span className="text-[12.5px] font-medium text-[#f9fafb]">
                          {sub.respondent_name || (
                            <span className="text-[#4b5563]">Anonymous</span>
                          )}
                        </span>
                      </td>

                      {/* IG Handle */}
                      <td className="px-4 py-3">
                        {sub.respondent_ig_handle ? (
                          <span className="text-[12px] text-[#9ca3af]">
                            @{sub.respondent_ig_handle}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[#4b5563]">—</span>
                        )}
                      </td>

                      {/* Submitted */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-[#6b7280]">
                        {fmtDateShort(sub.submitted_at)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge isCompleted={sub.is_completed} />
                      </td>

                      {/* Budget answer */}
                      <td className="max-w-[220px] px-4 py-3">
                        <span
                          className="block truncate text-[12.5px]"
                          style={{ color: budgetAns ? '#d1d5db' : '#4b5563' }}
                          title={budgetAns || undefined}
                        >
                          {budgetAns || '—'}
                        </span>
                      </td>

                      {/* Lead */}
                      <td className="px-4 py-3">
                        {sub.lead_id ? (
                          <Link
                            href={`/dashboard/crm/${sub.lead_id}`}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: 'rgba(16,185,129,0.12)',
                              color: '#34d399',
                            }}
                          >
                            Lead created
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        ) : (
                          <button
                            onClick={() => createLead(sub.id)}
                            disabled={creatingId === sub.id}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-white/5"
                            style={{
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#9ca3af',
                            }}
                          >
                            <UserPlus className="h-3 w-3" />
                            {creatingId === sub.id ? 'Creating…' : 'Create Lead'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TallyPage() {
  const [forms, setForms]           = useState<TallyFormBasic[]>([])
  const [formsLoading, setFormsLoading] = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [syncMsg, setSyncMsg]       = useState<string | null>(null)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [formDetail, setFormDetail]         = useState<FormDetail | null>(null)
  const [submissions, setSubmissions]       = useState<TallySubmission[]>([])
  const [insights, setInsights]             = useState<TallyInsights | null>(null)
  const [formLoading, setFormLoading]       = useState(false)
  const [funnelOpen, setFunnelOpen]         = useState(false)

  // ── Load forms list ───────────────────────────────────────────────────────

  const loadForms = useCallback(async (keepSelected?: string) => {
    setFormsLoading(true)
    try {
      const res  = await fetch('/api/tally/forms')
      if (!res.ok) return
      const data = (await res.json()) as {
        forms: TallyFormBasic[]
        last_synced_at: string | null
      }
      setForms(data.forms ?? [])
      setLastSynced(data.last_synced_at)
      // Auto-select first form on initial load
      if (data.forms?.length > 0 && !keepSelected) {
        setSelectedFormId((prev) => prev ?? data.forms[0].id)
      }
    } finally {
      setFormsLoading(false)
    }
  }, [])

  useEffect(() => { loadForms() }, [loadForms])

  // ── Load form detail when selected ───────────────────────────────────────

  const loadFormDetail = useCallback(async (formId: string) => {
    setFormLoading(true)
    setFormDetail(null)
    setSubmissions([])
    setInsights(null)
    try {
      const res = await fetch(`/api/tally/forms/${formId}/submissions`)
      if (!res.ok) return
      const data = (await res.json()) as {
        form: FormDetail
        submissions: TallySubmission[]
      }
      setFormDetail(data.form)
      setSubmissions(data.submissions ?? [])

      if (data.form?.tally_form_id) {
        const insRes = await fetch(
          `/api/tally/form/${data.form.tally_form_id}/insights`,
        )
        if (insRes.ok) setInsights((await insRes.json()) as TallyInsights)
      }
    } finally {
      setFormLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedFormId) loadFormDetail(selectedFormId)
  }, [selectedFormId, loadFormDetail])

  // ── Sync ──────────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    setSyncError(null)
    try {
      const res  = await fetch('/api/tally/sync', { method: 'POST' })
      const data = (await res.json()) as {
        forms?: number
        submissions?: number
        error?: string
      }
      if (!res.ok) {
        setSyncError(data.error ?? 'Sync failed')
        return
      }
      setSyncMsg(
        `Synced ${data.forms} form${data.forms !== 1 ? 's' : ''}, ${data.submissions} submission${data.submissions !== 1 ? 's' : ''}`,
      )
      const current = selectedFormId
      await loadForms(current ?? undefined)
      if (current) loadFormDetail(current)
    } catch {
      setSyncError('Network error — please try again')
    } finally {
      setSyncing(false)
    }
  }

  // ── Toggle qualification ──────────────────────────────────────────────────

  async function toggleQualification(formId: string, value: boolean) {
    setForms((prev) =>
      prev.map((f) =>
        f.id === formId ? { ...f, is_qualification_form: value } : f,
      ),
    )
    try {
      await fetch(`/api/tally/forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_qualification_form: value }),
      })
    } catch {
      setForms((prev) =>
        prev.map((f) =>
          f.id === formId ? { ...f, is_qualification_form: !value } : f,
        ),
      )
    }
  }

  function handleLeadCreated(subId: string, leadId: string) {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === subId ? { ...s, lead_id: leadId } : s)),
    )
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const questions = useMemo(
    () =>
      (insights?.questions ?? formDetail?.questions ?? []).filter((q) => q.title),
    [insights, formDetail],
  )

  const total          = insights?.counts.all       ?? formDetail?.total_submissions     ?? 0
  const completed      = insights?.counts.completed ?? formDetail?.completed_submissions ?? 0
  const started        = questions[0]?.numberOfResponses ?? total
  const completionRate = started > 0 ? Math.round((completed / started) * 100) : 0

  const budgetQuestion = useMemo(() => findBudgetQuestion(questions), [questions])

  const budgetBreakdownData = useMemo((): BudgetOption[] => {
    if (!budgetQuestion?.title) return []
    const completedSubs = submissions.filter((s) => s.is_completed === true)
    const counts: Record<string, number> = {}
    for (const sub of completedSubs) {
      const ans = strAnswer((sub.answers ?? {})[budgetQuestion.title!])
      if (ans) counts[ans] = (counts[ans] ?? 0) + 1
    }
    const totalAnswered = Object.values(counts).reduce((a, b) => a + b, 0)
    const sorted = Object.entries(counts).sort(([a], [b]) => {
      const na = extractFirstNumber(a)
      const nb = extractFirstNumber(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })
    return sorted.map(([label, count], i) => ({
      label,
      count,
      pct: totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0,
      color:
        sorted.length === 1
          ? '#9ca3af'
          : i === 0
          ? '#ef4444'
          : i === sorted.length - 1
          ? '#10b981'
          : '#f59e0b',
    }))
  }, [submissions, budgetQuestion])

  const subtitle = lastSynced
    ? `Last synced ${relativeTime(lastSynced)}`
    : 'Sync to pull the latest submissions'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader title="Tally Forms" subtitle={subtitle}>
        {syncMsg && (
          <span className="text-[12.5px] font-medium text-[#10b981]">{syncMsg}</span>
        )}
        {syncError && (
          <span className="text-[12.5px] font-medium text-[#ef4444]">{syncError}</span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: '#2563eb' }}
          onMouseEnter={(e) =>
            !syncing && (e.currentTarget.style.backgroundColor = '#1d4ed8')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = '#2563eb')
          }
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </PageHeader>

      <WebhookCard />

      {/* ── Form pills ── */}
      {formsLoading ? (
        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-32 rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : (
        <FormPills
          forms={forms}
          selectedId={selectedFormId}
          onSelect={setSelectedFormId}
          onToggleQualification={toggleQualification}
        />
      )}

      {/* ── Selected form content ── */}
      {selectedFormId && (
        <>
          {formLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl bg-white/[0.06]" />
                ))}
              </div>
              <Skeleton className="h-14 w-full rounded-xl bg-white/[0.06]" />
              <Skeleton className="h-64 w-full rounded-xl bg-white/[0.06]" />
              <Skeleton className="h-48 w-full rounded-xl bg-white/[0.06]" />
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                <StatCard
                  label="Total Views"
                  value={total}
                  sub="Tracked by Tally only"
                  icon={Eye}
                  accent="#6b7280"
                />
                <StatCard
                  label="Completions"
                  value={completed}
                  icon={CheckCircle}
                  accent="#10b981"
                />
                <StatCard
                  label="Completion Rate"
                  value={`${completionRate}%`}
                  icon={TrendingUp}
                  accent="#2563eb"
                />
              </div>

              {/* Drop-off funnel (collapsible) */}
              <div
                className="mb-6 overflow-hidden rounded-xl"
                style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <button
                  onClick={() => setFunnelOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-semibold text-[#9ca3af]">
                    Drop-off Funnel
                  </span>
                  {funnelOpen ? (
                    <ChevronUp className="h-4 w-4 text-[#4b5563]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#4b5563]" />
                  )}
                </button>
                {funnelOpen && (
                  <div
                    className="px-6 pb-6"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <DropoffFunnel
                      questions={questions}
                      total={total}
                      completed={completed}
                    />
                  </div>
                )}
              </div>

              {/* Budget breakdown */}
              {budgetQuestion && (
                <BudgetBreakdown
                  question={budgetQuestion}
                  options={budgetBreakdownData}
                  completedCount={
                    submissions.filter((s) => s.is_completed === true).length
                  }
                  answeredCount={budgetBreakdownData.reduce(
                    (a, b) => a + b.count,
                    0,
                  )}
                />
              )}

              {/* Submissions table */}
              <SubmissionsTable
                submissions={submissions}
                budgetQuestion={budgetQuestion}
                formName={formDetail?.name ?? 'tally-export'}
                onLeadCreated={handleLeadCreated}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
