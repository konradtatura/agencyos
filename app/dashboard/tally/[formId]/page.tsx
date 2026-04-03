'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowDown, Eye, MousePointer, ExternalLink, UserPlus,
  CheckCircle, TrendingUp, ChevronDown, ChevronUp,
  Search, Table2, LayoutList, Download,
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
  tally_form_id:         string
  name:                  string | null
  workspace_name:        string | null
  total_submissions:     number
  completed_submissions: number
  partial_submissions:   number
  is_qualification_form: boolean
  questions:             TallyQuestion[] | null
}

interface TallyInsights {
  questions: TallyQuestion[]
  counts:    { all: number; completed: number; partial: number }
}

type ViewMode   = 'cards' | 'table'
type FilterMode = 'all' | 'completed' | 'partial'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, accent,
}: {
  label:   string
  value:   string | number
  icon:    React.ElementType
  accent?: string
}) {
  const color = accent ?? '#6b7280'
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
    </div>
  )
}

// ── Funnel sub-components ─────────────────────────────────────────────────────

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
  icon:        React.ElementType
  iconBg:      string
  iconColor:   string
  value:       string | number
  label:       string
  valueColor?: string
  note?:       string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg, border: `1px solid ${iconColor}40` }}
      >
        <Icon className="h-4 w-4" style={{ color: iconColor }} />
      </div>
      <span className="font-mono text-[26px] font-bold leading-none" style={{ color: valueColor }}>
        {value}
      </span>
      <span className="text-center text-[12.5px] text-[#9ca3af]">{label}</span>
      {note && <span className="mt-0.5 text-center text-[11px] text-[#4b5563]">{note}</span>}
    </div>
  )
}

function FunnelDropConnector({ count, pct }: { count: number; pct: number }) {
  const hasDrops = count > 0
  const color    = hasDrops ? '#ef4444' : '#4b5563'
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

// ── Drop-off funnel (Tally-style) ─────────────────────────────────────────────

function DropoffFunnel({
  questions,
  total,
  completed,
}: {
  questions: TallyQuestion[]
  total:     number
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

  const q1Responses     = questions[0]?.numberOfResponses ?? 0
  const dropBeforeStart = Math.max(0, total - q1Responses)
  const dropBeforePct   = total > 0 ? Math.round((dropBeforeStart / total) * 100) : 0
  const completionRate  = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── Form views ── */}
      <FunnelNode
        icon={Eye} iconBg="rgba(107,114,128,0.1)" iconColor="#6b7280"
        value={total} label="Form views"
        note="Not available — tracked by Tally only"
      />

      {/* ── Drop-offs before starting ── */}
      <FunnelDropConnector count={dropBeforeStart} pct={dropBeforePct} />

      {/* ── Started answering ── */}
      <FunnelNode
        icon={MousePointer} iconBg="rgba(37,99,235,0.1)" iconColor="#2563eb"
        value={q1Responses} label="Respondents started answering" valueColor="#2563eb"
      />

      <FunnelVLine />

      {/* ── Question rows ── */}
      {questions.map((q, i) => {
        const responses  = q.numberOfResponses ?? 0
        const barPct     = q1Responses > 0 ? Math.round((responses / q1Responses) * 100) : 0
        const prevR      = i > 0 ? (questions[i - 1]?.numberOfResponses ?? q1Responses) : q1Responses
        const dropoff    = Math.max(0, prevR - responses)
        const dropPct    = prevR > 0 ? Math.round((dropoff / prevR) * 100) : 0
        const hasDropoff = i > 0 && dropoff > 0

        return (
          <div key={q.id}>
            {/* Separator between questions */}
            {i > 0 && <FunnelVLine />}

            <div className="py-2">
              {/* Question title — centered */}
              <p
                className="mb-3 text-center text-[13px] font-medium leading-snug text-[#d1d5db]"
                title={q.title}
              >
                {truncate(q.title ?? q.id, 80)}
              </p>

              {/* 3-column bar row */}
              <div className="flex items-center gap-3">
                {/* Left: views */}
                <div className="w-[72px] shrink-0 text-right">
                  <span className="text-[11.5px] text-[#6b7280]">{prevR} views</span>
                </div>

                {/* Center: proportional bar */}
                <div className="flex flex-1 items-center">
                  <div
                    className="flex h-10 items-center justify-center rounded-lg px-3 transition-all duration-700"
                    style={{
                      width:           `${Math.max(barPct, responses > 0 ? 10 : 2)}%`,
                      minWidth:        responses > 0 ? '72px' : '4px',
                      backgroundColor: 'rgba(37,99,235,0.13)',
                      border:          '1px solid rgba(37,99,235,0.2)',
                    }}
                  >
                    <span className="whitespace-nowrap text-[13px] font-semibold text-[#2563eb]">
                      {responses}
                      {barPct > 18 && <span className="ml-1 font-normal text-[#60a5fa]">Answers</span>}
                    </span>
                  </div>
                </div>

                {/* Right: drop-off */}
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

      {/* ── Completed ── */}
      <FunnelNode
        icon={CheckCircle} iconBg="rgba(16,185,129,0.1)" iconColor="#10b981"
        value={completed} label="Respondents completed the form" valueColor="#10b981"
      />

      <FunnelVLine />

      {/* ── Completion rate ── */}
      <FunnelNode
        icon={TrendingUp} iconBg="rgba(16,185,129,0.1)" iconColor="#10b981"
        value={`${completionRate}%`} label="Completion" valueColor="#10b981"
      />
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
  forceExpanded,
  onLeadCreated,
}: {
  sub:           TallySubmission
  questions:     TallyQuestion[]
  forceExpanded?: boolean
  onLeadCreated: (subId: string, leadId: string) => void
}) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const [creating, setCreating]           = useState(false)

  const expanded = forceExpanded ?? localExpanded

  const answers = sub.answers ?? {}

  const orderedQA: { title: string; answer: string }[] = useMemo(() => {
    if (questions.length > 0) {
      return questions
        .filter((q) => q.title)
        .map((q) => ({ title: q.title!, answer: strAnswer(answers[q.title!]) }))
    }
    return Object.entries(answers).map(([title, val]) => ({ title, answer: strAnswer(val) }))
  }, [questions, answers])

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
      <button
        onClick={() => setLocalExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="w-36 shrink-0 font-mono text-[12px] text-[#6b7280]">
          {fmtDateShort(sub.submitted_at)}
        </span>
        <span className="w-24 shrink-0">
          <StatusBadge isCompleted={sub.is_completed} />
        </span>
        {sub.respondent_name && (
          <span className="shrink-0 text-[12.5px] text-[#f9fafb]">{sub.respondent_name}</span>
        )}
        {sub.respondent_phone && (
          <span className="shrink-0 text-[12.5px] text-[#9ca3af]">{sub.respondent_phone}</span>
        )}
        {!expanded && preview.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#6b7280]">
            {preview.map((qa) => truncate(qa.answer, 40)).join('  ·  ')}
          </span>
        )}
        {!expanded && preview.length === 0 && (
          <span className="flex-1 text-[12.5px] text-[#4b5563]">No answers recorded</span>
        )}
        {expanded && <span className="flex-1" />}
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
        <span className="ml-1 shrink-0 text-[#4b5563]">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-5 py-4">
            {orderedQA.length === 0 ? (
              <p className="text-[13px] text-[#4b5563]">No answers recorded</p>
            ) : (
              <div>
                {orderedQA.map((qa, i) => (
                  <div key={qa.title}>
                    <div className="py-3">
                      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest text-[#4b5563]">
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
            {!sub.lead_id && (
              <div
                className="mt-4 flex justify-end"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}
              >
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
                    <td key={q.id} className="max-w-[200px] px-3 py-2.5" title={raw || undefined}>
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
  const cols    = questions.filter((q) => q.title)
  const headers = ['Submission Date', 'Completed', ...cols.map((q) => q.title!)]
  const rows    = submissions.map((sub) => {
    const answers = sub.answers ?? {}
    const status  = sub.is_completed === true ? 'Yes' : sub.is_completed === false ? 'No' : ''
    return [sub.submitted_at ?? '', status, ...cols.map((q) => strAnswer(answers[q.title!]))]
  })
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv    = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
  const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = `${formName ?? 'tally-export'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FormSubmissionsPage() {
  const { formId } = useParams<{ formId: string }>()

  const [form, setForm]               = useState<FormDetail | null>(null)
  const [submissions, setSubmissions] = useState<TallySubmission[]>([])
  const [insights, setInsights]       = useState<TallyInsights | null>(null)
  const [loading, setLoading]         = useState(true)
  const [viewMode, setViewMode]       = useState<ViewMode>('cards')
  const [filter, setFilter]           = useState<FilterMode>('all')
  const [search, setSearch]           = useState('')
  const [allExpanded, setAllExpanded] = useState<boolean | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tally/forms/${formId}/submissions`)
      if (!res.ok) return
      const data = await res.json() as { form: FormDetail; submissions: TallySubmission[] }
      setForm(data.form)
      setSubmissions(data.submissions ?? [])

      // Fetch live funnel data from Tally API (5-min cached)
      if (data.form?.tally_form_id) {
        const insRes = await fetch(`/api/tally/form/${data.form.tally_form_id}/insights`)
        if (insRes.ok) {
          setInsights(await insRes.json() as TallyInsights)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [formId])

  useEffect(() => { load() }, [load])

  function handleLeadCreated(subId: string, leadId: string) {
    setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, lead_id: leadId } : s))
  }

  // Prefer live Tally API data; fall back to DB snapshot when insights unavailable
  const total          = insights?.counts.all       ?? form?.total_submissions     ?? submissions.length
  const completed      = insights?.counts.completed ?? form?.completed_submissions ?? submissions.filter((s) => s.is_completed).length
  const partial        = insights?.counts.partial   ?? form?.partial_submissions   ?? submissions.filter((s) => s.is_completed === false).length
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  // Live questions for the funnel; fall back to DB snapshot
  const questions = useMemo(
    () => (insights?.questions ?? form?.questions ?? []).filter((q) => q.title),
    [insights, form],
  )

  const visibleSubs = useMemo(() => {
    let subs = submissions
    if (filter === 'completed') subs = subs.filter((s) => s.is_completed === true)
    if (filter === 'partial')   subs = subs.filter((s) => s.is_completed === false)
    if (search.trim()) {
      const q = search.toLowerCase()
      subs = subs.filter((s) => {
        if (!s.answers) return false
        return Object.values(s.answers).some((v) => v != null && String(v).toLowerCase().includes(q))
      })
    }
    return subs
  }, [submissions, filter, search])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48 bg-white/[0.06]" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 bg-white/[0.06]" />)}
        </div>
        <Skeleton className="h-96 w-full bg-white/[0.06]" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-white/[0.06]" />)}
      </div>
    )
  }

  return (
    <>
      {/* ── Header ── */}
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

      {/* ── Stats (3 cards) ── */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Started answering" value={total}                icon={MousePointer} accent="#6b7280" />
        <StatCard label="Completions"        value={completed}            icon={CheckCircle}  accent="#10b981" />
        <StatCard label="Completion rate"    value={`${completionRate}%`} icon={TrendingUp}   accent="#2563eb" />
      </div>

      {/* ── Drop-off funnel ── */}
      <div
        className="mb-8 rounded-xl p-6"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-6 text-[14px] font-semibold text-[#f9fafb]">Drop-off funnel</p>
        <DropoffFunnel questions={questions} total={total} completed={completed} />
      </div>

      {/* ── Submissions section header ── */}
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
        <div className="relative flex flex-1 items-center" style={{ minWidth: '180px', maxWidth: '320px' }}>
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-[#4b5563]" style={{ pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search answers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg py-1.5 pl-8 pr-3 text-[12.5px] text-[#f9fafb] placeholder-[#4b5563] outline-none"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Expand / Collapse all (cards mode only) */}
          {viewMode === 'cards' && (
            <button
              onClick={() => setAllExpanded((v) => v === true ? false : true)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#6b7280] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}

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

          {/* Export CSV (table mode) */}
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

      {/* ── Submissions list ── */}
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
              forceExpanded={allExpanded}
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
