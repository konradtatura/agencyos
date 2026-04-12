'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Loader2, CheckCircle2, GitBranch } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface FunnelStep {
  label: string
  path:  string
}

interface FunnelBranch {
  id:    string
  label: string
  color: string
  steps: FunnelStep[]
}

interface Funnel {
  id:         string
  name:       string
  entry_path: string
  branches:   FunnelBranch[]
}

interface FunnelConfig {
  funnels: Funnel[]
}

// ── Shared input style ─────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg px-3 py-1.5 text-[13px] text-[#f9fafb] placeholder-[#4b5563] outline-none focus:border-white/20 transition-colors'
const INPUT_STYLE = { backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' } as const

// ── Step row ───────────────────────────────────────────────────────────────

function StepRow({
  step, onChange, onRemove, canRemove,
}: {
  step:     FunnelStep
  onChange: (s: FunnelStep) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        className={INPUT}
        style={INPUT_STYLE}
        value={step.label}
        placeholder="Step label"
        onChange={e => onChange({ ...step, label: e.target.value })}
      />
      <input
        className={INPUT}
        style={INPUT_STYLE}
        value={step.path}
        placeholder="/path"
        onChange={e => onChange({ ...step, path: e.target.value })}
      />
      {canRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 text-white/20 hover:text-[#f87171] transition-colors"
          title="Remove step"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

// ── Branch card ────────────────────────────────────────────────────────────

function BranchCard({
  branch, onChange,
}: {
  branch:   FunnelBranch
  onChange: (b: FunnelBranch) => void
}) {
  function updateStep(i: number, s: FunnelStep) {
    const steps = branch.steps.map((st, j) => (j === i ? s : st))
    onChange({ ...branch, steps })
  }

  function addStep() {
    onChange({ ...branch, steps: [...branch.steps, { label: '', path: '' }] })
  }

  function removeStep(i: number) {
    onChange({ ...branch, steps: branch.steps.filter((_, j) => j !== i) })
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        backgroundColor: '#0d1117',
        border: `1px solid ${branch.color}30`,
      }}
    >
      {/* Branch header */}
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: branch.color }}
        />
        <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">
          {branch.label}
        </span>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-2 gap-2 px-0.5">
        <span className="text-[10px] uppercase tracking-widest text-white/25">Label</span>
        <span className="text-[10px] uppercase tracking-widest text-white/25">Path</span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {branch.steps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            onChange={s => updateStep(i, s)}
            onRemove={() => removeStep(i)}
            canRemove={branch.steps.length > 1}
          />
        ))}
      </div>

      <button
        onClick={addStep}
        className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors self-start"
      >
        <Plus size={12} />
        Add step
      </button>
    </div>
  )
}

// ── Funnel card ────────────────────────────────────────────────────────────

function FunnelCard({
  funnel, onChange,
}: {
  funnel:   Funnel
  onChange: (f: Funnel) => void
}) {
  function updateBranch(i: number, b: FunnelBranch) {
    const branches = funnel.branches.map((br, j) => (j === i ? b : br))
    onChange({ ...funnel, branches })
  }

  return (
    <div
      className="rounded-xl p-5 space-y-5"
      style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Funnel meta */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/30 mb-1.5">
            Funnel name
          </label>
          <input
            className={INPUT}
            style={INPUT_STYLE}
            value={funnel.name}
            placeholder="e.g. DM Organic"
            onChange={e => onChange({ ...funnel, name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/30 mb-1.5">
            Entry page path
          </label>
          <input
            className={INPUT}
            style={INPUT_STYLE}
            value={funnel.entry_path}
            placeholder="/apply"
            onChange={e => onChange({ ...funnel, entry_path: e.target.value })}
          />
        </div>
      </div>

      {/* Branch cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {funnel.branches.map((branch, i) => (
          <BranchCard
            key={branch.id}
            branch={branch}
            onChange={b => updateBranch(i, b)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FunnelSetup() {
  const [config,  setConfig]  = useState<FunnelConfig>({ funnels: [] })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/creator/funnel-config')
      .then(r => r.json())
      .then((d: { funnel_config?: FunnelConfig }) => {
        const cfg = d.funnel_config
        if (cfg && typeof cfg === 'object' && Array.isArray((cfg as FunnelConfig).funnels)) {
          setConfig(cfg as FunnelConfig)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function updateFunnel(i: number, f: Funnel) {
    setConfig(prev => ({
      funnels: prev.funnels.map((fn, j) => (j === i ? f : fn)),
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/creator/funnel-config', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ funnel_config: config }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Save failed'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div
            key={i}
            className="h-40 rounded-xl animate-pulse"
            style={{ backgroundColor: '#111827' }}
          />
        ))}
      </div>
    )
  }

  if (config.funnels.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <GitBranch className="w-8 h-8 text-white/10 mx-auto mb-3" />
        <p className="text-[13px] text-white/40">No funnels configured yet.</p>
        <p className="text-[12px] text-white/20 mt-1">
          Run migration 031_funnel_config.sql or contact your admin.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {config.funnels.map((funnel, i) => (
        <FunnelCard
          key={funnel.id}
          funnel={funnel}
          onChange={f => updateFunnel(i, f)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#2563eb' }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : 'Save funnel config'}
        </button>

        {saved && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34d399' }}
          >
            <CheckCircle2 size={11} />
            Saved
          </span>
        )}

        {error && (
          <span className="text-[12px] text-[#f87171]">{error}</span>
        )}
      </div>
    </div>
  )
}
