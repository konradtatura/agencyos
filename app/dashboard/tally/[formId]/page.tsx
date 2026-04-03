'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ExternalLink, UserPlus,
  FileText, CheckCircle, AlertCircle, TrendingUp,
  ChevronDown, ChevronUp, Search, Table2, LayoutList, Download,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ────────────────────────────────────────────────────────────────────

interface TallyQuestion {
  id:                 string
  title?:             string
  type?:              string
  numberOfResponses?: number
}

interface TallySubmission {
  id:                   string
  tally_submission_id:  string
  respondent_name:      string | null
  respondent_phone:     string | null
  respondent_ig_handle: string | null
  answers:              Record<string, unknown> | null
  submitted_at:         string | null
  lead_id:              string | null
  is_completed:         boolean | null
}

interface FormDetail {
  id:                    string
  name:                  string | null
  workspace_name:        string | null
  total_submissions:     number
  completed_submissions: number
  partial_submissions:   number
  is_qualification_form: boolean
  questions:             TallyQuestion[] | null
}

type ViewMode   = 'cards' | 'table'
type FilterMode = 'all' | 'completed' | 'partial'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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
  const s = String(val).trim()
  return s
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '…' : str
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label:   string
  value:   string | number
  sub?:    string
  icon:    React.ElementType
  accent?: string
}) {
  const color = accent ?? '#2563eb'
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-4"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-[#6b7280]">{label}</span>
        <div className="rounded-lg p-1.5" style={{ backgroundColor: `${color}1a` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
      </div>
      <span className="font-mono text-[26px] font-semibold leading-none text-[#f9fafb]">{value}</span>
      {sub && <span className="text-[11.5px] text-[#6b7280]">{sub}</span>}
    </div>
  )
}

// ── Drop-off funnel ───────────────────────────────────────────────────────────

function DropoffFunnel({ questions }: { questions: TallyQuestion[] }) {
  if (!questions.length) {
    return (
      <p className="py-6 text-center text-[13px] text-[#6b7280]">
        No question data available — run a sync to populate funnel data
      </p>
    )
  }

  const baseline = questions[0]?.numberOfResponses ?? 0

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const responses = q.numberOfResponses ?? 0
        const pct       = baseline > 0 ? Math.round((responses / baseline) * 100) : 0
        const prev      = questions[i - 1]?.numberOfResponses ?? responses
        const dropoff   = prev - responses
        const dropPct   = prev > 0 ? Math.round((dropoff / prev) * 100) : 0
        const isEmpty   = responses === 0

        return (
          <div key={q.id} className="group">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span
                className="text-[12.5px] font-medium leading-snug"
                style={{ color: isEmpty ? '#4b5563' : '#d1d5db' }}
              >
                {i + 1}. {q.title ?? q.id}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                {i > 0 && dropoff > 0 && (
                  <span className="text-[11.5px] font-medium" style={{ color: '#ef4444' }}>
                    ↓ {dropoff} drop-off{dropoff !== 1 ? 's' : ''} ({dropPct}%)
                  </span>
                )}
                {i > 0 && dropoff === 0 && (
                  <span className="text-[11.5px]" style={{ color: '#4b5563' }}>No drop-offs</span>
                )}
                <span
                  className="min-w-[3rem] text-right font-mono text-[12.5px] font-semibold"
                  style={{ color: isEmpty ? '#4b5563' : '#f9fafb' }}
                >
                  {responses}
                </span>
              </div>
            </div>
            <div
              className="h-6 overflow-hidden rounded-md"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <div
                className="flex h-full items-center justify-end pr-2 transition-all duration-500"
                style={{
                  width:           `${Math.max(pct, pct > 0 ? 1 : 0)}%`,
                  backgroundColor: isEmpty ? 'rgba(75,85,99,0.3)' : 'rgba(37,99,235,0.5)',
                  minWidth:        pct > 0 ? '2px' : '0',
                }}
              >
                {pct > 10 && (
                  <span className="text-[10.5px] font-semibold text-white/80">{pct}%</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────

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

// ── Submission card ───────────────────────────────────────────────────────────

function SubmissionCard({
  sub,
  questions,
  onLeadCreated,
}: {
  sub:          TallySubmission
  questions:    TallyQuestion[]
  onLeadCreated: (subId: string, leadId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [creating, setCreating] = useState(false)

  const answers = sub.answers ?? {}

  // Build ordered Q&A using questions array order, fall back to raw answers order
  const orderedQA: { title: string; answer: string }[] = useMemo(() => {
    if (questions.length > 0) {
      return questions
        .filter((q) => q.title)
        .map((q) => ({
          title:  q.title!,
          answer: strAnswer(answers[q.title!]),
        }))
    }
    return Object.entries(answers).map(([title, val]) => ({
      title,
      answer: strAnswer(val),
    }))
  }, [questions, answers])

  // First 2 non-empty answers for collapsed preview
  const preview = orderedQA.filter((qa) => qa.answer).slice(0, 2)

  async function createLead() {
    setCreating(true)
    try {
      const res  = await fetch(`/api/tally/submissions/${sub.id}/create-lead`, { method: 'POST' })
      const data = await res.json() as { lead_id?: string }
      if (res.ok && data.lead_id) onLeadCreated(sub.id, data.lead_id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="overflow-hidden rounded-xl transition-all"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        {/* Date */}
        <span className="w-36 shrink-0 font-mono text-[12px] text-[#6b7280]">
          {fmtDateShort(sub.submitted_at)}
        </span>

        {/* Status */}
        <span className="w-24 shrink-0">
          <StatusBadge isCompleted={sub.is_completed} />
        </span>

        {/* Phone (if captured) */}
        {sub.respondent_phone && (
          <span className="shrink-0 text-[12.5px] text-[#9ca3af]">{sub.respondent_phone}</span>
        )}

        {/* Collapsed preview */}
        {!expanded && preview.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#6b7280]">
            {preview.map((qa) => truncate(qa.answer, 40)).join('  ·  ')}
          </span>
        )}
        {!expanded && preview.length === 0 && (
          <span className="flex-1 text-[12.5px] text-[#4b5563]">No answers recorded</span>
        )}

        {expanded && <span className="flex-1" />}

        {/* CRM badge (inline) */}
        {sub.lead_id && (
          <Link
            href={`/dashboard/crm/${sub.lead_id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
          >
            Lead <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        )}

        {/* Chevron */}
        <span className="ml-1 shrink-0 text-[#4b5563]">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded answers */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-5 py-4">
            {orderedQA.length === 0 ? (
              <p className="text-[13px] text-[#4b5563]">No answers recorded</p>
            ) : (
              <div className="space-y-0">
                {orderedQA.map((qa, i) => (
                  <div key={qa.title}>
                    <div className="py-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#4b5563]">
                        {qa.title}
                      </p>
                      <p className="text-[13.5px] leading-relaxed text-[#f9fafb]">
                        {qa.answer || <span className="text-[#4b5563]">—</span>}
                      </p>
                    </div>
                    {i < orderedQA.length - 1 && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer actions */}
            {!sub.lead_id && (
              <div className="mt-4 flex justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                <button
                  onClick={createLead}
                  disabled={creating}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: '#2563eb' }}
                  onMouseEnter={(e) => !creating && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {creating ? 'Creating…' : 'Create CRM Lead'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Table view ────────────────────────────────────────────────────────────────

function TableView({
  submissions,
  questions,
}: {
  submissions: TallySubmission[]
  questions:   TallyQuestion[]
}) {
  const cols = questions.filter((q) => q.title)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            {['Date', 'Status', ...cols.map((q) => truncate(q.title!, 24))].map((h, i) => (
              <th
                key={i}
                className="sticky top-0 whitespace-nowrap px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#6b7280]"
                style={{
                  backgroundColor: '#0a0f1e',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  minWidth: i < 2 ? undefined : '140px',
                  maxWidth: '200px',
                }}
                title={i >= 2 ? cols[i - 2]?.title : undefined}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {submissions.map((sub, ri) => {
            const answers = sub.answers ?? {}
            return (
              <tr
                key={sub.id}
                style={{ borderBottom: ri < submissions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                className="transition-colors hover:bg-white/[0.02]"
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[#6b7280]">
                  {fmtDateShort(sub.submitted_at)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge isCompleted={sub.is_completed} />
                </td>
                {cols.map((q) => {
                  const raw = strAnswer(answers[q.title!])
                  return (
                    <td
                      key={q.id}
                      className="max-w-[200px] px-3 py-2.5"
                      title={raw || undefined}
                    >
                      <span className="block truncate text-[#d1d5db]">
                        {raw || <span className="text-[#4b5563]">—</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(submissions: TallySubmission[], questions: TallyQuestion[], formName: string) {
  const cols = questions.filter((q) => q.title)
  const headers = ['Submission Date', 'Completed', ...cols.map((q) => q.title!)]

  const rows = submissions.map((sub) => {
    const answers = sub.answers ?? {}
    const status  = sub.is_completed === true ? 'Yes' : sub.is_completed === false ? 'No' : ''
    return [
      sub.submitted_at ?? '',
      status,
      ...cols.map((q) => strAnswer(answers[q.title!])),
    ]
  })

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${formName ?? 'tally-export'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FormSubmissionsPage() {
  const { formId } = useParams<{ formId: string }>()

  const [form, setForm]               = useState<FormDetail | null>(null)
  const [submissions, setSubmissions] = useState<TallySubmission[]>([])
  const [loading, setLoading]         = useState(true)
  const [viewMode, setViewMode]       = useState<ViewMode>('cards')
  const [filter, setFilter]           = useState<FilterMode>('all')
  const [search, setSearch]           = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/tally/forms/${formId}/submissions`)
      if (!res.ok) return
      const data = await res.json() as { form: FormDetail; submissions: TallySubmission[] }
      setForm(data.form)
      setSubmissions(data.submissions ?? [])
    } finally {
      setLoading(false)
    }
  }, [formId])

  useEffect(() => { load() }, [load])

  function handleLeadCreated(subId: string, leadId: string) {
    setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, lead_id: leadId } : s))
  }

  const total          = form?.total_submissions     ?? submissions.length
  const completed      = form?.completed_submissions ?? submissions.filter((s) => s.is_completed).length
  const partial        = form?.partial_submissions   ?? submissions.filter((s) => s.is_completed === false).length
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const questions = useMemo(
    () => (form?.questions ?? []).filter((q) => q.title),
    [form],
  )

  const visibleSubs = useMemo(() => {
    let subs = submissions

    if (filter === 'completed') subs = subs.filter((s) => s.is_completed === true)
    if (filter === 'partial')   subs = subs.filter((s) => s.is_completed === false)

    if (search.trim()) {
      const q = search.toLowerCase()
      subs = subs.filter((s) => {
        if (!s.answers) return false
        return Object.values(s.answers).some(
          (v) => v != null && String(v).toLowerCase().includes(q),
        )
      })
    }

    return subs
  }, [submissions, filter, search])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48 bg-white/[0.06]" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 bg-white/[0.06]" />)}
        </div>
        <Skeleton className="h-64 w-full bg-white/[0.06]" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-white/[0.06]" />)}
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard/tally"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex flex-1 items-center gap-3">
          <h1 className="text-[20px] font-semibold text-[#f9fafb]">{form?.name ?? 'Form'}</h1>
          {form?.workspace_name && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}
            >
              {form.workspace_name}
            </span>
          )}
        </div>

        <span className="font-mono text-[13px] text-[#6b7280]">
          {total} submission{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total"           value={total}                icon={FileText}    />
        <StatCard label="Completed"       value={completed}            icon={CheckCircle} accent="#10b981" />
        <StatCard label="Partial"         value={partial}              icon={AlertCircle} accent="#f59e0b" />
        <StatCard label="Completion rate" value={`${completionRate}%`} icon={TrendingUp}  accent="#2563eb" />
      </div>

      {/* Drop-off funnel */}
      <div
        className="mb-6 rounded-xl p-5"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-4 text-[13px] font-semibold text-[#f9fafb]">Question Drop-off</p>
        <DropoffFunnel questions={questions} />
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Filter tabs */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {([
            { key: 'all',       label: `All (${submissions.length})` },
            { key: 'completed', label: `Completed (${completed})` },
            { key: 'partial',   label: `Partial (${partial})` },
          ] as { key: FilterMode; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="rounded-md px-3 py-1 text-[11.5px] font-medium transition-colors"
              style={{
                backgroundColor: filter === key ? 'rgba(255,255,255,0.08)' : 'transparent',
                color:           filter === key ? '#f9fafb' : '#6b7280',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div
          className="relative flex flex-1 items-center"
          style={{ minWidth: '180px', maxWidth: '320px' }}
        >
          <Search
            className="absolute left-2.5 h-3.5 w-3.5 text-[#4b5563]"
            style={{ pointerEvents: 'none' }}
          />
          <input
            type="text"
            placeholder="Search answers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg py-1.5 pl-8 pr-3 text-[12.5px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div
            className="flex items-center gap-0.5 rounded-lg p-0.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <button
              onClick={() => setViewMode('cards')}
              className="rounded-md p-1.5 transition-colors"
              style={{
                backgroundColor: viewMode === 'cards' ? 'rgba(255,255,255,0.08)' : 'transparent',
                color:           viewMode === 'cards' ? '#f9fafb' : '#6b7280',
              }}
              title="Card view"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className="rounded-md p-1.5 transition-colors"
              style={{
                backgroundColor: viewMode === 'table' ? 'rgba(255,255,255,0.08)' : 'transparent',
                color:           viewMode === 'table' ? '#f9fafb' : '#6b7280',
              }}
              title="Table view"
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Export CSV */}
          {viewMode === 'table' && (
            <button
              onClick={() => exportCSV(visibleSubs, questions, form?.name ?? 'tally-export')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Submissions */}
      {visibleSubs.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-xl py-16"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[13px] text-[#4b5563]">
            {search ? 'No submissions match your search' :
             filter === 'completed' ? 'No completed submissions' :
             filter === 'partial'   ? 'No partial submissions' :
                                      'No submissions yet'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="space-y-2">
          {visibleSubs.map((sub) => (
            <SubmissionCard
              key={sub.id}
              sub={sub}
              questions={questions}
              onLeadCreated={handleLeadCreated}
            />
          ))}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <TableView submissions={visibleSubs} questions={questions} />
        </div>
      )}
    </>
  )
}
