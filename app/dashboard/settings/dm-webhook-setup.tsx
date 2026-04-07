'use client'

import { useState } from 'react'
import { Copy, Eye, EyeOff, Check, Terminal, Globe, Key, MessageSquare } from 'lucide-react'

interface DmWebhookSetupProps {
  webhookUrl:  string
  verifyToken: string
}

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 600, color: '#4b5563',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
      }}>
        {label}
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '9px 12px',
      }}>
        <span style={{
          flex: 1, fontSize: 13, color: '#d1d5db',
          fontFamily: mono ? 'monospace' : 'inherit',
          wordBreak: 'break-all',
        }}>
          {value}
        </span>
        <button
          onClick={handleCopy}
          title="Copy to clipboard"
          style={{
            flexShrink: 0, padding: 5, borderRadius: 5, cursor: 'pointer',
            backgroundColor: copied ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
            border: 'none', color: copied ? '#34d399' : '#9ca3af',
            transition: 'all 0.15s',
          }}
        >
          {copied
            ? <Check style={{ width: 13, height: 13 }} />
            : <Copy style={{ width: 13, height: 13 }} />
          }
        </button>
      </div>
    </div>
  )
}

function MaskedTokenField({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const masked = '•'.repeat(Math.min(value.length, 32))

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 600, color: '#4b5563',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
      }}>
        {label}
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '9px 12px',
      }}>
        <span style={{
          flex: 1, fontSize: 13, color: '#d1d5db', fontFamily: 'monospace',
          letterSpacing: revealed ? 'normal' : '0.06em', wordBreak: 'break-all',
        }}>
          {revealed ? value : masked}
        </span>
        <button
          onClick={() => setRevealed((r) => !r)}
          title={revealed ? 'Hide token' : 'Reveal token'}
          style={{
            flexShrink: 0, padding: 5, borderRadius: 5, cursor: 'pointer',
            backgroundColor: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af',
          }}
        >
          {revealed
            ? <EyeOff style={{ width: 13, height: 13 }} />
            : <Eye    style={{ width: 13, height: 13 }} />
          }
        </button>
        <button
          onClick={handleCopy}
          title="Copy to clipboard"
          style={{
            flexShrink: 0, padding: 5, borderRadius: 5, cursor: 'pointer',
            backgroundColor: copied ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
            border: 'none', color: copied ? '#34d399' : '#9ca3af',
            transition: 'all 0.15s',
          }}
        >
          {copied
            ? <Check style={{ width: 13, height: 13 }} />
            : <Copy  style={{ width: 13, height: 13 }} />
          }
        </button>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        backgroundColor: 'rgba(37,99,235,0.15)', color: '#60a5fa',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>
        {n}
      </div>
      <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.55, margin: 0, paddingTop: 2 }}>
        {children}
      </p>
    </div>
  )
}

// ── Test webhook section ──────────────────────────────────────────────────────

function TestWebhookSection() {
  const [text,     setText]     = useState('Test message from webhook simulator')
  const [username, setUsername] = useState('test_user')
  const [result,   setResult]   = useState<{ ok: boolean; conversation_id?: string; error?: string } | null>(null)
  const [running,  setRunning]  = useState(false)

  async function handleTest() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/dms/test-webhook', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, senderUsername: username }),
      })
      const data = await res.json() as { ok: boolean; conversation_id?: string; error?: string }
      setResult(data)
    } catch {
      setResult({ ok: false, error: 'Network error' })
    } finally {
      setRunning(false)
    }
  }

  const curlSnippet = `curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/dms/test-webhook \\
  -H "Content-Type: application/json" \\
  -b "your-session-cookie" \\
  -d '{"text":"${text}","senderUsername":"${username}"}'`

  return (
    <div style={{
      marginTop: 20, padding: 16,
      backgroundColor: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Terminal style={{ width: 14, height: 14, color: '#6b7280' }} />
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Test Webhook
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
            Sender username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#f9fafb', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
            Message text
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#f9fafb', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <button
        onClick={handleTest}
        disabled={running}
        style={{
          padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
          backgroundColor: running ? 'rgba(37,99,235,0.2)' : '#2563eb',
          color: '#fff', border: 'none',
          cursor: running ? 'not-allowed' : 'pointer',
          transition: 'all 0.1s',
        }}
      >
        {running ? 'Sending…' : 'Send test DM'}
      </button>

      {result && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 7,
          backgroundColor: result.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${result.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          {result.ok ? (
            <p style={{ fontSize: 12.5, color: '#34d399', margin: 0 }}>
              ✓ Created conversation{' '}
              <a
                href="/dashboard/dms"
                style={{ color: '#60a5fa', textDecoration: 'underline' }}
              >
                View in DM Inbox
              </a>
              {result.conversation_id && (
                <span style={{ color: '#4b5563', marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
                  {result.conversation_id}
                </span>
              )}
            </p>
          ) : (
            <p style={{ fontSize: 12.5, color: '#f87171', margin: 0 }}>
              ✗ {result.error ?? 'Unknown error'}
            </p>
          )}
        </div>
      )}

      {/* curl snippet */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 11.5, color: '#4b5563', cursor: 'pointer' }}>
          cURL equivalent
        </summary>
        <pre style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 7, overflowX: 'auto',
          backgroundColor: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', lineHeight: 1.5,
        }}>
          {curlSnippet}
        </pre>
      </details>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DmWebhookSetup({ webhookUrl, verifyToken }: DmWebhookSetupProps) {
  const tokenProvided = verifyToken && verifyToken !== 'not_set'

  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{
          marginTop: 2, width: 40, height: 40, flexShrink: 0, borderRadius: 10,
          backgroundColor: 'rgba(37,99,235,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MessageSquare style={{ width: 18, height: 18, color: '#2563eb' }} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', margin: '0 0 3px' }}>
            Instagram DM Webhook
          </p>
          <p style={{ fontSize: 12.5, color: '#6b7280', margin: 0 }}>
            Register this webhook in your Meta App Dashboard to receive DMs in real-time.
          </p>
        </div>
      </div>

      {/* Token warning */}
      {!tokenProvided && (
        <div style={{
          marginBottom: 16, padding: '8px 12px', borderRadius: 8,
          backgroundColor: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          fontSize: 12.5, color: '#fbbf24',
        }}>
          ⚠ <strong>INSTAGRAM_WEBHOOK_VERIFY_TOKEN</strong> is not set in your environment.
          Add it to <code style={{ fontSize: 11 }}>.env.local</code> before registering the webhook.
        </div>
      )}

      {/* Credentials */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
        <CopyField
          label="Callback URL"
          value={webhookUrl}
        />
        <MaskedTokenField
          label="Verify Token"
          value={tokenProvided ? verifyToken : '(not set — add INSTAGRAM_WEBHOOK_VERIFY_TOKEN to .env.local)'}
        />
      </div>

      {/* Steps */}
      <div style={{
        padding: 14, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <Globe style={{ width: 13, height: 13, color: '#4b5563' }} />
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Registration steps
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Step n={1}>
            Go to{' '}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>
              Meta Developer Dashboard
            </a>
            {' '}→ select your app → <strong style={{ color: '#d1d5db' }}>Add Product → Webhooks</strong>
          </Step>
          <Step n={2}>
            Select <strong style={{ color: '#d1d5db' }}>Instagram</strong> from the product list.
          </Step>
          <Step n={3}>
            Under <strong style={{ color: '#d1d5db' }}>Instagram Webhooks</strong>, click{' '}
            <strong style={{ color: '#d1d5db' }}>Edit Subscription</strong>.
            Paste the <strong style={{ color: '#d1d5db' }}>Callback URL</strong> and{' '}
            <strong style={{ color: '#d1d5db' }}>Verify Token</strong> from above, then click{' '}
            <strong style={{ color: '#d1d5db' }}>Verify and Save</strong>.
          </Step>
          <Step n={4}>
            Subscribe to the <strong style={{ color: '#d1d5db' }}>messages</strong> field.
          </Step>
          <Step n={5}>
            Your Instagram Business account must be linked to a Facebook Page and that Page
            must be connected to the app with <strong style={{ color: '#d1d5db' }}>pages_messaging</strong> permission.
          </Step>
        </div>
      </div>

      {/* Test section */}
      <TestWebhookSection />
    </div>
  )
}
