import { ExternalLink, CheckCircle2, XCircle, PauseCircle, Activity } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'

const STATUS_TONE = {
  up: 'success',
  down: 'danger',
  seems_down: 'danger',
  paused: 'warning',
  not_checked: 'neutral',
}

function timeAgo(unixOrIso) {
  if (!unixOrIso) return '—'
  const ms = typeof unixOrIso === 'number' ? unixOrIso * 1000 : new Date(unixOrIso).getTime()
  const mins = Math.floor((Date.now() - ms) / 60000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-success">
      <CheckCircle2 size={16} />
      {message}
    </div>
  )
}

export function MonitorList({ items, emptyMessage, integrationId }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((m) => {
        const tone = STATUS_TONE[m.status] || 'neutral'
        return (
          <Card key={m.id} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}>
                    {tone === 'danger' ? <XCircle size={11} /> : tone === 'warning' ? <PauseCircle size={11} /> : <CheckCircle2 size={11} />}
                    {m.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{m.name}</span>
                  {m.uptime_ratio && (
                    <span className="text-[11px] text-text-faint">{m.uptime_ratio}% uptime</span>
                  )}
                </div>
                {m.url && (
                  <p className="text-[11px] text-text-faint truncate">{m.url}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {tone === 'danger' && integrationId && (
                  <AddToWatchlistButton
                    integrationId={integrationId}
                    provider="uptimerobot"
                    resourceType="monitor"
                    externalId={String(m.id)}
                    resourceName={m.name}
                    title={`Monitor ${m.status.replace('_', ' ')} — ${m.name}`}
                    severity="high"
                    raw={m}
                  />
                )}
                <a
                  href="https://uptimerobot.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-faint hover:text-accent transition-colors"
                  title="Open UptimeRobot"
                >
                  <ExternalLink size={15} />
                </a>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function IncidentList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((incident, i) => {
        const tone = incident.type === 'down' ? 'danger' : 'success'
        return (
          <Card key={`${incident.monitor_id}-${incident.datetime}-${i}`} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}>
                    <Activity size={11} /> {incident.type}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{incident.monitor_name}</span>
                  <span className="text-[11px] text-text-faint">{timeAgo(incident.datetime)}</span>
                </div>
                {incident.reason && (
                  <p className="text-[11px] text-text-faint truncate">{incident.reason}</p>
                )}
                {incident.duration ? (
                  <p className="mt-0.5 text-[11px] text-text-faint">
                    Duration: {Math.round(incident.duration / 60)}m
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
