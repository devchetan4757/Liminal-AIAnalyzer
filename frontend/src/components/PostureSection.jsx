import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { getPosture, getPostureHistory, triggerPostureScan, resolveFinding } from '../api/client'
import { Card, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'

const SEVERITY_TONE = {
  critical: 'danger',
  high:     'danger',
  medium:   'warning',
  low:      'neutral',
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

const CATEGORY_LABEL = {
  misconfig:       'Misconfiguration',
  secret_leak:     'Secret Leak',
  vuln_dependency: 'Vulnerable Dependency',
  anomaly:         'Anomalous Activity',
  credential_age:  'Credential Age',
}

function scoreTone(score) {
  if (score >= 85) return { text: 'text-success', ring: 'stroke-success', icon: ShieldCheck }
  if (score >= 60) return { text: 'text-warning', ring: 'stroke-warning', icon: ShieldAlert }
  return { text: 'text-danger', ring: 'stroke-danger', icon: ShieldAlert }
}

// Small dependency-free ring instead of pulling in a charting library
// just for one number -- circumference math for a 36px SVG circle.
function ScoreRing({ score }) {
  const { text, ring, icon: Icon } = scoreTone(score)
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r={radius} strokeWidth="6" className="stroke-bg-inset" fill="none" />
        <circle
          cx="40" cy="40" r={radius} strokeWidth="6" fill="none"
          className={ring}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <Icon size={13} className={text} />
        <span className={`font-mono text-lg font-bold ${text}`}>{score}</span>
      </div>
    </div>
  )
}

// Dependency-free sparkline -- a handful of points doesn't need a full
// charting library, just a polyline scaled into a fixed viewBox.
function Sparkline({ history }) {
  if (history.length < 2) {
    return <p className="text-xs text-text-faint">Not enough scans yet for a trend.</p>
  }

  const w = 240, svgHeight = 48, pad = 4
  const scores = history.map(item => item.score)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const span = max - min || 1

  return (
    <svg width={w} height={svgHeight} className="text-accent">
      <polyline
        points={history.map((item, i) => {
          const x = pad + (i / (history.length - 1)) * (w - pad * 2)
          const y = svgHeight - pad - ((item.score - min) / span) * (svgHeight - pad * 2)
          return `${x},${y}`
        }).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

function FindingRow({ finding, onResolve }) {
  const [resolving, setResolving] = useState(false)

  const handleResolve = async () => {
    setResolving(true)
    try { await onResolve(finding.id) } finally { setResolving(false) }
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge tone={SEVERITY_TONE[finding.severity] || 'neutral'}>{finding.severity}</Badge>
          <span className="text-[11px] text-text-faint">{CATEGORY_LABEL[finding.category] || finding.category}</span>
        </div>
        <p className="text-sm text-text">{finding.title}</p>
        <p className="text-[11px] text-text-faint">
          Detected {finding.detected_at ? new Date(finding.detected_at).toLocaleString() : 'recently'}
        </p>
      </div>
      <Button variant="secondary" size="xs" disabled={resolving} onClick={handleResolve}>
        {resolving ? '…' : 'Resolve'}
      </Button>
    </div>
  )
}

// Embed anywhere a single integration is already in scope, e.g. at the
// bottom of GitHubDashboard / NetlifyDashboard / etc:
//
//   <PostureSection integration={integration} />
//
// Deliberately self-contained (own loading/error state, own data
// fetching) so it drops into any existing dashboard page without that
// page needing to know anything about posture scoring.
export function PostureSection({ integration, integrations, onSelect }) {
  const [posture, setPosture] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!integration?.id) return
    setLoading(true)
    setError('')
    try {
      const [p, h] = await Promise.all([
        getPosture(integration.id),
        getPostureHistory(integration.id, { limit: 20 }),
      ])
      setPosture(p)
      setHistory(h.history)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!integration?.id) return
    load()
  }, [integration?.id])

  // Overview mode: no single integration in scope yet (e.g. the
  // Connected Apps landing screen before anything is selected).
  // Nothing to fetch, so just show a friendly placeholder instead of
  // crashing on integration.id below.
  if (!integration) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Security Posture</CardTitle>
        </CardHeader>
        {!integrations || integrations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <ShieldQuestion size={24} className="text-text-faint" />
            <p className="text-sm text-text-dim">No apps connected yet.</p>
            <p className="text-xs text-text-faint">Connect an app to see its security posture.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-dim">Select an app on the left to view its security posture.</p>
            <div className="flex flex-wrap gap-1.5">
              {integrations.map(i => (
                <Badge
                  key={i.id}
                  tone="neutral"
                  className={onSelect ? 'cursor-pointer' : ''}
                  onClick={() => onSelect?.(i)}
                >
                  {i.display_name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>
    )
  }

  const handleScan = async () => {
    setScanning(true)
    try {
      await triggerPostureScan(integration.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setScanning(false)
    }
  }

  const handleResolve = async (findingId) => {
    await resolveFinding(findingId)
    await load()
  }

  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="h-20 w-20 rounded-full bg-bg-inset" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-danger/40 bg-danger-soft/20">
        <p className="text-sm text-danger font-medium mb-1">Couldn't load posture data</p>
        <p className="text-sm text-text-dim">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={load}>Retry</Button>
      </Card>
    )
  }

  const findings = [...(posture?.findings || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Posture</CardTitle>
        <Button variant="secondary" size="sm" onClick={handleScan} disabled={scanning}>
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          Scan now
        </Button>
      </CardHeader>

      {posture?.score == null ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ShieldQuestion size={24} className="text-text-faint" />
          <p className="text-sm text-text-dim">No scan yet for this integration.</p>
          <p className="text-xs text-text-faint">Run one to see its security posture score.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing score={posture.score} />

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-text-faint">Score breakdown</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(posture.breakdown || {}).length === 0 ? (
                <span className="text-xs text-text-faint">No deductions -- clean scan.</span>
              ) : (
                Object.entries(posture.breakdown).map(([category, delta]) => (
                  <Badge key={category} tone="neutral">
                    {CATEGORY_LABEL[category] || category} {delta}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-text-faint">Trend</span>
            <Sparkline history={history} />
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-border pt-3">
        <span className="mb-2 block text-[11px] uppercase tracking-wider text-text-faint">
          Open findings ({findings.length})
        </span>
        {findings.length === 0 ? (
          <p className="py-3 text-sm text-text-faint">No open findings.</p>
        ) : (
          <div className="flex flex-col">
            {findings.map(f => (
              <FindingRow key={f.id} finding={f} onResolve={handleResolve} />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
