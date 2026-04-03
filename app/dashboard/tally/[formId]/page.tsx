'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, X, ExternalLink, UserPlus,
  FileText, TrendingUp, Calendar, Users,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// ── Types ────────────────────────────────────────────────────────────────────

interface TallySubmission {
  id: string
  tally_submission_id: string
  respondent_name:     string | null
  respondent_phone:    string | null
  respondent_ig_handle: string | null
  answers:             Record<string, unknown> | null
  submitted_at:        string | null
  lead_id:             string | null
}

interface FormDetail {
  id: string
  name:              string | null
  workspace_name:    string | null
  total_submissions: number
  is_qualification_form: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '…' : str
}

function firstAnswer(answers: Record<string, unknown> | null): string {
  if (!answers) return '—'
  const first = Object.values(answers)[0]
  if (first == null) return '—'
  return truncate(String(first), 60)
}

function isThisWeek(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000
}

// ── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-4"
      style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-[#6b7280]">{label}</span>
        <div className="rounded-lg p-1.5" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
          <Icon className="h-3.5 w-3.5 text-[#2563eb]" />
        </div>
      </div>
      <span className="font-mono text-[26px] font-semibold leading-none text-[#f9fafb]">{value}</span>
    </div>
  )
}

// ── Slide-over panel ─────────────────────────────────────────────────────────

function SubmissionPanel({
  submission,
  onClose,
  onLeadCreated,
}: {
  submission: TallySubmission
  onClose:    () => void
  onLeadCreated: (subId: string, leadId: string) => void
}) {
  const [creating, setCreating] = useState(false)

  async function createLeadManually() {
    setCreating(true)
    try {
      const res  = await fetch(`/api/tally/submissions/${submission.id}/create-lead`, { method: 'POST' })
      const data = await res.json() as { lead_id?: string; error?: string }
      if (res.ok && data.lead_id) {
        onLeadCreated(submission.id, data.lead_id)
      }
    } finally {
      setCreating(false)
    }
  }

  const answers = submission.answers ?? {}

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col overflow-hidden"
        style={{ backgroundColor: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="text-[14px] font-semibold text-[#f9fafb]">
              {submission.respondent_name ?? 'Anonymous'}
            </p>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">{fmtDate(submission.submitted_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lead banner */}
        {submission.lead_id && (
          <div
            className="mx-4 mt-4 flex shrink-0 items-center justify-between gap-3 rounded-lg px-3.5 py-2.5"
            style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <span className="text-[12.5px] font-medium text-[#34d399]">CRM Lead created</span>
            <Link
              href={`/dashboard/crm/${submission.lead_id}`}
              className="flex items-center gap-1 text-[12px] font-medium text-[#34d399] underline"
            >
              View lead <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Q&A list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {Object.keys(answers).length === 0 ? (
            <p className="text-[13px] text-[#6b7280]">No answers recorded</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(answers).map(([question, answer], i, arr) => (
                <div key={question}>
                  <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-[#6b7280]">
                    {question}
                  </p>
                  <p className="text-[13.5px] leading-relaxed text-[#f9fafb]">
                    {answer != null ? String(answer) : '—'}
                  </p>
                  {i < arr.length - 1 && (
                    <div className="mt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!submission.lead_id && (
          <div
            className="shrink-0 p-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <button
              onClick={createLeadManually}
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: '#2563eb' }}
              onMouseEnter={(e) => !creating && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              <UserPlus className="h-4 w-4" />
              {creating ? 'Creating…' : 'Create Lead Manually'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FormSubmissionsPage() {
  const { formId } = useParams<{ formId: string }>()

  const [form, setForm]               = useState<FormDetail | null>(null)
  const [submissions, setSubmissions] = useState<TallySubmission[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<TallySubmission | null>(null)

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
    setSubmissions((prev) =>
      prev.map((s) => s.id === subId ? { ...s, lead_id: leadId } : s)
    )
    setSelected((prev) => prev?.id === subId ? { ...prev, lead_id: leadId } : prev)
  }

  // -- Stats --
  const total        = submissions.length
  const thisWeek     = submissions.filter((s) => isThisWeek(s.submitted_at)).length
  const leadsCreated = submissions.filter((s) => s.lead_id).length
  const conversion   = total > 0 ? Math.round((leadsCreated / total) * 100) : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-48 bg-white/[0.06]" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 bg-white/[0.06]" />)}
        </div>
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full bg-white/[0.06]" />)}
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
          <h1 className="text-[20px] font-semibold text-[#f9fafb]">
            {form?.name ?? 'Form'}
          </h1>
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
        <Stat label="Total"      value={total}        icon={FileText}   />
        <Stat label="This week"  value={thisWeek}     icon={Calendar}   />
        <Stat label="Leads"      value={leadsCreated} icon={Users}      />
        <Stat label="Conversion" value={`${conversion}%`} icon={TrendingUp} />
      </div>

      {/* Table */}
      {submissions.length === 0 ? (
        <div
          className="rounded-xl py-16 text-center"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[13px] text-[#6b7280]">No submissions yet</p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl"
          style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Date', 'Name', 'Phone', 'Instagram', 'Preview', 'CRM Lead', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub, i) => (
                <tr
                  key={sub.id}
                  style={{
                    borderBottom: i < submissions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  {/* Date */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-[12px] text-[#9ca3af]">{fmtDate(sub.submitted_at)}</span>
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3">
                    <span className="text-[13px] text-[#f9fafb]">{sub.respondent_name ?? '—'}</span>
                  </td>

                  {/* Phone */}
                  <td className="px-4 py-3">
                    <span className="text-[12.5px] text-[#9ca3af]">{sub.respondent_phone ?? '—'}</span>
                  </td>

                  {/* Instagram */}
                  <td className="px-4 py-3">
                    <span className="text-[12.5px] text-[#9ca3af]">{sub.respondent_ig_handle ?? '—'}</span>
                  </td>

                  {/* Preview */}
                  <td className="max-w-[180px] px-4 py-3">
                    <span className="truncate text-[12.5px] text-[#6b7280]">
                      {firstAnswer(sub.answers)}
                    </span>
                  </td>

                  {/* CRM Lead */}
                  <td className="px-4 py-3">
                    {sub.lead_id ? (
                      <Link
                        href={`/dashboard/crm/${sub.lead_id}`}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-opacity hover:opacity-80"
                        style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
                      >
                        Lead created <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-[#4b5563]">—</span>
                    )}
                  </td>

                  {/* View answers */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(sub)}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/5 hover:text-[#f9fafb]"
                      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      View answers
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over */}
      {selected && (
        <SubmissionPanel
          submission={selected}
          onClose={() => setSelected(null)}
          onLeadCreated={handleLeadCreated}
        />
      )}
    </>
  )
}
