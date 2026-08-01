import { useEffect, useState } from 'react'
import { RefreshCw, X, Activity, Globe, AlertTriangle, Rocket } from 'lucide-react'
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

function fmtDateTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}

// ── Response-time line chart (built only from successful checks) ─────────

function ResponseTimeChart({ points }) {
  const usable = points.filter(p => p.response_time_ms != null)

  if (!usable.length) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg bg-black/20 text-xs text-text-faint">
        No response-time data yet — check back in a moment
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

  const values = usable.map(p => p.response_time_ms)
  const min = Math.min(...values, 0)
  const max = Math.max(...values)
  const spread = max - min || 1

  const toX = i => PL + (i / (usable.length - 1 || 1)) * innerW
  const toY = v => PT + innerH - ((v - min) / spread) * innerH

  const linePath = usable.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.response_time_ms).toFixed(1)}`
  ).join(' ')

  const areaPath = `${linePath} L${toX(usable.length - 1).toFixed(1)},${PT + innerH} L${PL},${PT + innerH} Z`

  const gridLevels = [0, 0.33, 0.66, 1].map(f => ({
    y: PT + innerH - f * innerH,
    val: min + f * spread,
  }))

  const xTicks = [0, Math.floor((usable.length - 1) / 2), usable.length - 1].map(i => ({
    x: toX(i),
    label: fmtTime(usable[i].timestamp),
    anchor: i === 0 ? 'start' : i === usable.length - 1 ? 'end' : 'middle',
  }))

  const color = '#38bdf8'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 112 }}>
      <defs>
        <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
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

      <path d={areaPath} fill="url(#respGrad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

      {/* down checks marked in red along the line */}
      {points.map((p, i) => !p.is_up && (
        <circle key={`down-${i}`} cx={toX(Math.min(i, usable.length - 1)).toFixed(1)} cy={PT + innerH} r="2.5" fill="#ef4444" />
      ))}

      <circle
        cx={toX(usable.length - 1).toFixed(1)}
        cy={toY(usable[usable.length - 1].response_time_ms).toFixed(1)}
        r="3" fill={color}
      />

      {xTicks.map((t, i) => (
        <text key={i} x={t.x.toFixed(1)} y={H - 1} textAnchor={t.anchor} fontSize="7.5" fill="#ffffff35">
          {t.label}
        </text>
      ))}
    </svg>
  )
}

// ── Compact up/down timeline strip ────────────────────────────────────────

function StatusStrip({ points }) {
  if (!points.length) return null
  return (
    <div className="flex h-2 w-full gap-[1.5px] overflow-hidden rounded-sm">
      {points.map((p, i) => (
        <div
          key={i}
          title={`${fmtDateTime(p.timestamp)} · ${p.is_up ? `up (${p.status_code ?? '—'})` : 'down'}`}
          className="h-full flex-1"
          style={{ backgroundColor: p.is_up ? '#22c55e' : '#ef4444', opacity: p.is_up ? 0.85 : 1 }}
        />
      ))}
    </div>
  )
}

// ── Stat tile ──────────────────────────────────────────────────────────

function Stat({ label, value, unit = '', tone }) {
  const toneColor = { good: '#22c55e', bad: '#ef4444', neutral: '#38bdf8' }[tone] || '#e5e5e5'
  return (
    <div className="rounded-lg border border-border bg-bg-inset px-3 py-2 flex-1 min-w-[92px]">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-text-faint mb-1">{label}</div>
      <div className="font-mono text-lg font-bold" style={{ color: toneColor }}>
        {value !== null && value !== undefined ? value : '—'}
        {value !== null && value !== undefined && <span className="text-xs font-normal text-text-faint ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────

export function ServicePerformancePanel({ integrationId, serviceId, serviceName, serviceType, onClose }) {
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

  const uptimeTone = data?.uptime_percentage == null ? undefined
    : data.uptime_percentage >= 99 ? 'good'
    : data.uptime_percentage >= 95 ? undefined
    : 'bad'

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
                  hours === r.hours ? 'bg-accent text-white' : 'text-text-faint hover:text-text'
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

        {loading && !data && (
          <>
            <div className="h-16 animate-pulse rounded-lg bg-bg-inset" />
            <div className="h-40 animate-pulse rounded-lg bg-bg-inset" />
          </>
        )}

        {!loading && error && !data && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft/20 p-4 text-sm text-danger">
            <p className="font-medium mb-1">Failed to load performance data</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        )}

        {data && !data.monitorable && (
          <div className="rounded-lg border border-border bg-bg-inset p-4 text-sm text-text-dim flex items-start gap-2">
            <Globe size={15} className="text-text-faint mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-text mb-1">No public URL to monitor</p>
              <p className="text-xs text-text-faint">
                This is a private service, background worker, or cron job, so there's nothing to
                ping directly. Deploy activity below is still real data for this range.
              </p>
            </div>
          </div>
        )}

        {data && data.monitorable && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Stat
                label="Uptime"
                value={data.uptime_percentage != null ? data.uptime_percentage.toFixed(2) : null}
                unit="%"
                tone={uptimeTone}
              />
              <Stat label="Avg response" value={data.avg_response_ms} unit="ms" tone="neutral" />
              <Stat label="P95 response" value={data.p95_response_ms} unit="ms" tone="neutral" />
              <Stat label="Checks" value={data.total_checks} unit="" />
            </div>

            <div className="rounded-lg border border-border bg-bg-inset p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">Response Time</span>
                {data.url && (
                  <a href={data.url} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline truncate max-w-[220px]">
                    {data.url}
                  </a>
                )}
              </div>
              <ResponseTimeChart points={data.points} />
              <div className="mt-3">
                <StatusStrip points={data.points} />
              </div>
            </div>

            {data.incidents?.length > 0 && (
              <div className="rounded-lg border border-danger/30 bg-danger-soft/10 p-4">
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-widest text-danger">
                  <AlertTriangle size={12} /> Recent downtime
                </div>
                <div className="flex flex-col gap-1.5">
                  {data.incidents.map((inc, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-text-dim">{fmtDateTime(inc.timestamp)}</span>
                      <span className="text-danger font-mono text-[11px]">{inc.error || inc.status_code || 'down'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {data && data.recent_deploys?.length > 0 && (
          <div className="rounded-lg border border-border bg-bg-inset p-4">
            <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-widest text-text-faint">
              <Rocket size={12} /> Deploys in range
            </div>
            <div className="flex flex-col gap-1.5">
              {data.recent_deploys.map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-text-dim truncate max-w-[220px]">{d.commit_message || d.id}</span>
                  <Badge tone={d.status === 'live' ? 'success' : d.status?.includes('fail') ? 'danger' : 'neutral'}>
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-5 py-2 text-[10px] text-text-faint flex-shrink-0">
        Last {hours >= 24 ? `${hours / 24}d` : `${hours}h`} · live check each open/refresh
      </div>
    </div>
  )
}
