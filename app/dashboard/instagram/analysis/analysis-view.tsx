'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ContentAnalysis } from '@/lib/analysis/content-analyzer'

export interface HistoryItem {
  id: string
  created_at: string
  post_count: number
  analysis: ContentAnalysis
}

interface Props {
  connected: boolean
  transcribedCount: number
  initialAnalysis: ContentAnalysis | null
  initialHistoryId: string | null
  initialHistory: HistoryItem[]
  weeklyCount: number
  resetDate: string | null
}

const RATE_LIMIT = 3

// ── Score ring ─────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 10)
  const color = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="128" height="128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle
          cx="64" cy="64" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-white leading-none">{score}</span>
        <span className="text-xs text-gray-400 mt-0.5">/ 10</span>
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

// ── Difficulty badge ───────────────────────────────────────────────────────────

function DifficultyBadge({ level }: { level?: string }) {
  if (!level) return null
  const cfg =
    level === 'Easy'   ? { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80',  border: 'rgba(34,197,94,0.25)'  } :
    level === 'Medium' ? { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24',  border: 'rgba(245,158,11,0.25)' } :
                         { bg: 'rgba(239,68,68,0.12)',  color: '#f87171',  border: 'rgba(239,68,68,0.25)'  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {level}
    </span>
  )
}

// ── Full analysis display (reused for main + history accordion) ────────────────

function AnalysisDisplay({ analysis }: { analysis: ContentAnalysis }) {
  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-5 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <ScoreRing score={analysis.overall_score} />
        <div className="flex-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Overall Score</p>
          <p className="text-gray-200 leading-relaxed">{analysis.summary}</p>
        </div>
      </div>

      {/* Content Pillars */}
      {analysis.content_pillars.length > 0 && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Content Pillars</p>
          <div className="flex flex-wrap gap-2">
            {analysis.content_pillars.map((p) => (
              <span key={p} className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: 'rgba(37,99,235,0.15)', color: '#93c5fd', border: '1px solid rgba(37,99,235,0.25)' }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Optimal Length */}
      {'optimal_length' in analysis && (analysis as ContentAnalysis & { optimal_length?: string }).optimal_length && (
        <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.18)' }}>
          <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">Optimal Reel Length</p>
          <p className="text-gray-200 text-sm">{(analysis as ContentAnalysis & { optimal_length?: string }).optimal_length}</p>
        </div>
      )}

      {/* Top + Underperforming side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        {analysis.top_topics.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">Top Topics</p>
            <div className="space-y-2">
              {analysis.top_topics.map((t) => (
                <div key={t.topic} className="flex items-center justify-between">
                  <span className="text-sm text-gray-200">{t.topic}</span>
                  <span className="text-sm font-bold text-green-400 ml-2 shrink-0">{t.avg_engagement.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {analysis.underperforming_topics.length > 0 && (
          <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Underperforming</p>
            <div className="space-y-2">
              {analysis.underperforming_topics.map((t) => (
                <div key={t.topic} className="flex items-center justify-between">
                  <span className="text-sm text-gray-200">{t.topic}</span>
                  <span className="text-sm font-bold text-red-400 ml-2 shrink-0">{t.avg_engagement.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hook Analysis */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Hook Analysis</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-green-400 mb-2">Best Hooks</p>
            <ul className="space-y-1.5">
              {analysis.hook_analysis.best_hooks.map((h, i) => (
                <li key={i} className="text-xs text-gray-300 italic">▸ "{h}"</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-400 mb-2">Worst Hooks</p>
            <ul className="space-y-1.5">
              {analysis.hook_analysis.worst_hooks.map((h, i) => (
                <li key={i} className="text-xs text-gray-300 italic">▸ "{h}"</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 px-3 py-2 rounded-lg text-xs text-blue-200" style={{ backgroundColor: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.20)' }}>
          <span className="font-semibold text-blue-300">Pattern: </span>{analysis.hook_analysis.pattern}
        </div>
      </div>

      {/* Recommendations */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recommendations</p>
        <div className="space-y-3">
          {analysis.recommendations.map((r, i) => (
            <div key={i} className="rounded-lg p-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa' }}>{i + 1}</span>
                <span className="text-white font-semibold text-sm">{r.title}</span>
                <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>{r.format}</span>
                {'difficulty' in r && <DifficultyBadge level={(r as typeof r & { difficulty?: string }).difficulty} />}
              </div>
              <p className="text-blue-300 text-xs italic mb-1">"{r.hook}"</p>
              <p className="text-gray-400 text-xs">{r.why}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── History accordion item ─────────────────────────────────────────────────────

function HistoryAccordion({ item, isLatest }: { item: HistoryItem; isLatest: boolean }) {
  const [open, setOpen] = useState(false)

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
    })
  }

  const score = item.analysis.overall_score
  const scoreColor = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444'

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${open ? 'rgba(37,99,235,0.30)' : 'rgba(255,255,255,0.06)'}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
        style={{ backgroundColor: open ? 'rgba(37,99,235,0.08)' : '#111827' }}
      >
        <div className="flex items-center gap-4">
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{fmtDate(item.created_at)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.post_count} reel{item.post_count !== 1 ? 's' : ''} analyzed{isLatest ? ' · Latest' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold" style={{ color: scoreColor }}>{score}/10</span>
          <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2" style={{ backgroundColor: '#0d1424' }}>
          <AnalysisDisplay analysis={item.analysis} />
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function AnalysisView({
  connected,
  transcribedCount,
  initialAnalysis,
  initialHistory,
  weeklyCount,
  resetDate,
}: Props) {
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(initialAnalysis)
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atLimit    = weeklyCount >= RATE_LIMIT
  const canAnalyze = connected && transcribedCount >= 10 && !atLimit

  function fmtResetDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  }

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/instagram/analyze', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Analysis failed.')
        return
      }
      setAnalysis(data.analysis)
      const newItem: HistoryItem = {
        id:         `temp-${Date.now()}`,
        created_at: new Date().toISOString(),
        post_count: data.postCount,
        analysis:   data.analysis,
      }
      setHistory((h) => [newItem, ...h])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.')
    } finally {
      setLoading(false)
    }
  }

  // Rate limit label
  const rateLimitLabel = atLimit && resetDate
    ? `${RATE_LIMIT}/${RATE_LIMIT} analyses used this week. Resets on ${fmtResetDate(resetDate)}.`
    : !atLimit && weeklyCount > 0
    ? `${weeklyCount}/${RATE_LIMIT} used this week`
    : null

  return (
    <div className="space-y-6">
      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p className="text-white font-semibold">AI Content Analysis</p>
          <p className="text-gray-400 text-sm mt-0.5">
            {!connected
              ? 'Connect Instagram to get started'
              : atLimit
              ? rateLimitLabel
              : transcribedCount >= 10
              ? `${transcribedCount} reels transcribed${rateLimitLabel ? ` · ${rateLimitLabel}` : ''}`
              : `${transcribedCount}/10 reels transcribed — need at least 10`}
          </p>
        </div>

        <button
          onClick={runAnalysis}
          disabled={!canAnalyze || loading}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shrink-0"
          style={
            canAnalyze && !loading
              ? { backgroundColor: 'rgba(37,99,235,0.20)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.40)' }
              : { backgroundColor: 'rgba(255,255,255,0.04)', color: '#4b5563', border: '1px solid rgba(255,255,255,0.06)', cursor: 'not-allowed' }
          }
        >
          {loading ? 'Analyzing…' : atLimit ? `${RATE_LIMIT}/${RATE_LIMIT} used` : 'Analyze My Content'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm text-red-400" style={{ backgroundColor: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}>
          {error}
        </div>
      )}

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="rounded-xl p-8 flex flex-col items-center gap-4" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white font-semibold">Analyzing your last 20 reels…</p>
          <p className="text-gray-400 text-sm">This usually takes 15–45 seconds</p>
        </div>
      )}

      {/* ── Current analysis (latest) ───────────────────────────────────────── */}
      {!loading && analysis && (
        <div className="rounded-xl p-5" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Latest Analysis</p>
          <AnalysisDisplay analysis={analysis} />
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && !analysis && (
        <div className="rounded-xl p-10 flex flex-col items-center gap-3 text-center" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-4xl">🧠</span>
          <p className="text-white font-semibold">No analysis yet</p>
          <p className="text-gray-400 text-sm max-w-sm">
            {connected
              ? transcribedCount >= 10
                ? 'Click "Analyze My Content" to generate your first report.'
                : `Transcribe ${10 - transcribedCount} more reel${10 - transcribedCount !== 1 ? 's' : ''} to unlock analysis.`
              : 'Connect Instagram in Settings to get started.'}
          </p>
          {connected && transcribedCount < 10 && (
            <Link href="/dashboard/instagram/content" className="mt-2 text-sm font-semibold" style={{ color: '#60a5fa' }}>
              Go to Content →
            </Link>
          )}
        </div>
      )}

      {/* ── Analysis history ────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">Analysis History ({history.length})</h3>
          {history.map((item, idx) => (
            <HistoryAccordion key={item.id} item={item} isLatest={idx === 0} />
          ))}
        </div>
      )}
    </div>
  )
}
