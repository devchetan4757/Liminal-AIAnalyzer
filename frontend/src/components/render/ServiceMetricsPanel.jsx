import { useEffect, useState } from 'react'
import { RefreshCw, X, Activity, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { getRenderServicePerformance } from '../../api/client'

const RANGES = [
  { label: '1h',  hours: 1 },
  { label: '3h',  hours: 3 },
  { label: '24h', hours: 24 },
  { label: '7d',  hours: 168 },
]

function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}

// ── Full SVG chart with gridlines + axes ──────────────────────────────────
// Down/unreachable checks (no response_time_ms) are plotted as gaps in the
// line rather than dropped from the x-axis, so an outage is visible in the
// chart's shape instead of silently disappearing.

function ResponseTimeChart({ points }) {
  const withValues = points?.filter(p => p.response_time_ms !== null) ?? []

  if (!points?.length) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg bg-black/20 text-xs text-text-faint">
        No checks yet for this time range — reopen the panel in a moment.
      </div>
    )
  }

  if (!withValues.length) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg bg-black/20 text-xs text-danger">
        Every check in this window failed — the service looks unreachable.
      </div>
    )
  }

  const W = 500
  const H = 100
  const PL = 36
  const PR = 6
  const PT = 6
  const PB = 18

  const innerW = W - PL - PR
  const innerH = H - PT - PB

  const values = withValues.map(p => p.response_time_ms)
  const min    = Math.min(...values, 0)
  const max    = Math.max(...values)
  const spread = max - min || 1

  const toX = i => PL + (i / (points.length - 1 || 1)) * innerW
  const toY = v => PT + innerH - ((v - min) / spread) * innerH

  // Build the line as separate segments, breaking at any down/gap point
  // so outages read as a visible break rather than a straight line across them.
  const segments = []
  let current = []
  points.forEach((p, i) => {
    if (p.response_time_ms === null) {
      if (current.length) segments.push(current)
      current = []
    } else {
      current.push(`${current.length === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.response_time_ms).toFixed(1)}`)
    }
  })
  if (current.length) segments.push(current)
  const linePaths = segments.map(seg => seg.join(' '))

  const gridLevels = [0, 0.33, 0.66, 1].map(f => ({
    y:   PT + innerH - f * innerH,
    val: min + f * spread,
  }))

  const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].map(i => ({
    x:  toX(i),
    label: fmtTime(points[i].timestamp),
    anchor: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle',
  }))

  const lastPoint = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: 112 }}
    >
      <defs>
        <linearGradient id="respTimeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridLevels.map((g, i) => (
        <g key={i}>
          <line x1={PL} y1={g.y.toFixed(1)} x2={W - PR} y2={g.y.toFixed(1)} stroke="#ffffff14" strokeWidth="0.8" />
          <text x={PL - 3} y={g.y.toFixed(1)} textAnchor="end" dominantBaseline="middle" fontSize="7.5" fill="#ffffff45">
            {Math.round(g.val)}
          </text>
        </g>
      ))}

      {segments.map((seg, i) => (
        <path key={i} d={seg.join(' ')} fill="none" stroke="#38bdf8" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {/* down markers - a small red tick where a check failed */}
      {points.map((p, i) => p.response_time_ms === null ? (
        <line
          key={`down-${i}`}
          x1={toX(i).toFixed(1)} y1={PT} x2={toX(i).toFixed(1)} y2={PT + innerH}
          stroke="#ef4444" strokeWidth="1.2" strokeDasharray="2,2" opacity="0.6"
        />
      ) : null)}

      {lastPoint?.response_time_ms !== null && (
        <circle cx={toX(points.length - 1).toFixed(1)} cy={toY(lastPoint.response_time_ms).toFixed(1)} r="3" fill="#38bdf8" />
      )}

      {xTicks.map((t, i) => (
        <text key={i} x={t.x.toFixed(1)} y={H - 1} textAnchor={t.anchor} fontSize="7.5" fill="#ffffff35">
          {t.label}
        </text>
      ))}
    </svg>
  )
}

// ── Status summary row (real "is this website up right now" state) ───────

function StatusSummary({ status, uptimePct, avgMs, minMs, maxMs, checksCount, lastError }) {
  const icon = status === 'up'
    ? <CheckCircle2 size={14} className="text-success" />
    : status === 'down'
      ? <XCircle size={14} className="text-danger" />
      : <HelpCircle size={14} className="text-text-faint" />

  const tone = status === 'up' ? 'success' : status === 'down' ? 'danger' : 'neutral'

  return (
    <div className="rounded-lg border border-border bg-bg-inset p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">Live Status</span>
        <Badge tone={tone} className="gap-1.5">
          {icon} {status === 'unknown' ? 'No data yet' : status.toUpperCase()}
        </Badge>
      </div>

      {status === 'down' && lastError && (
        <p className="mb-3 text-xs text-danger">{lastError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint mb-0.5">Uptime</p>
          <p className="font-mono font-bold">{uptimePct !== null ? `${uptimePct}%` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint mb-0.5">Avg response</p>
          <p className="font-mono font-bold">{avgMs !== null ? `${avgMs} ms` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint mb-0.5">Fastest / Slowest</p>
          <p className="font-mono text-text-dim">
            {minMs !== null ? `${minMs} ms` : '—'} / {maxMs !== null ? `${maxMs} ms` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint mb-0.5">Checks in range</p>
          <p className="font-mono text-text-dim">{checksCount}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main inline panel (not a modal) ──────────────────────────────────────

export function ServiceMetricsPanel({ integrationId, serviceId, serviceName, serviceType, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [hours, setHours]     = useState(3)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getRenderServicePerformance(integrationId, serviceId, { hours })
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [integrationId, serviceId, hours])

  const points = data?.points ?? []

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-bg">

      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity size={15} className="text-accent flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text truncate">{serviceName}</p>
            {serviceType && (
              <p className="text-[10px] text-text-faint capitalize">{serviceType.replace(/_/g, ' ')}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex rounded border border-border overflow-hidden">
            {RANGES.map(r => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  hours === r.hours
                    ? 'bg-accent text-white'
                    : 'text-text-faint hover:text-text'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </Button>
          <button onClick={onClose} className="text-text-faint hover:text-text transition-colors">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

        {loading && (
          <>
            <div className="h-32 animate-pulse rounded-lg bg-bg-inset" />
            <div className="h-40 animate-pulse rounded-lg bg-bg-inset" />
          </>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft/20 p-4 text-sm text-danger">
            <p className="font-medium mb-1">Failed to load performance data</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <StatusSummary
              status={data.current_status}
              uptimePct={data.uptime_pct}
              avgMs={data.avg_response_time_ms}
              minMs={data.min_response_time_ms}
              maxMs={data.max_response_time_ms}
              checksCount={data.checks_count}
              lastError={data.last_error}
            />

            <div className="rounded-lg border border-border bg-bg-inset p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">Response Time</span>
                {points.length > 0 && points[points.length - 1].response_time_ms !== null && (
                  <span className="font-mono text-xl font-bold leading-none text-[#38bdf8]">
                    {points[points.length - 1].response_time_ms}
                    <span className="text-sm font-normal text-text-faint ml-0.5"> ms</span>
                  </span>
                )}
              </div>
              <ResponseTimeChart points={points} />
            </div>

            {data.service_url && (
              <p className="text-[10px] text-text-faint break-all">
                Checking: <span className="font-mono text-text-dim">{data.service_url}</span>
              </p>
            )}
          </>
        )}
      </div>

      <div className="border-t border-border px-5 py-2 text-[10px] text-text-faint flex-shrink-0">
        Live HTTP check against the service's own URL · works on every Render plan, including Free
      </div>
    </div>
  )
}
