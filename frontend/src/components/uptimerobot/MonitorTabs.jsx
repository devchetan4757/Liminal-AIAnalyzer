import { useState } from 'react'
import { ExternalLink, CheckCircle2, XCircle, PauseCircle, PlayCircle, RotateCcw, Trash2, Activity, Pencil } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'
import { RemoteActionButton } from '../actions/RemoteActionButton'
import { MonitorFormDialog } from './MonitorFormDialog'

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

export function MonitorList({ items, emptyMessage, integrationId, onChanged }) {
  const [editingId, setEditingId] = useState(null)

  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((m) => {
        const tone = STATUS_TONE[m.status] || 'neutral'
        const paused = m.status === 'paused'
        return (
          <Card key={m.id} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
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
              <div className="flex flex-wrap items-center gap-1 self-start xl:self-auto xl:justify-end w-full xl:w-auto">
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
                {integrationId && (
                  <Button
                    variant="secondary"
                    size="iconXs"
                    className="shrink-0"
                    onClick={() => setEditingId(m.id)}
                    title="Edit monitor config"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="uptimerobot"
                    action={paused ? 'resume' : 'pause'}
                    resourceId={String(m.id)}
                    resourceName={m.name}
                    variant="secondary"
                    size="iconXs"
                    icon={paused ? PlayCircle : PauseCircle}
                    onDone={onChanged}
                  />
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="uptimerobot"
                    action="reset"
                    resourceId={String(m.id)}
                    resourceName={m.name}
                    variant="secondary"
                    icon={RotateCcw}
                    size="iconXs"
                    onDone={onChanged}
                  />
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="uptimerobot"
                    action="delete"
                    resourceId={String(m.id)}
                    resourceName={m.name}
                    variant="danger"
                    icon={Trash2}
                    size="iconXs"
                    onDone={onChanged}
                  />
                )}
                <a
                  href="https://uptimerobot.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-faint hover:bg-surface-hover hover:text-accent transition-colors"
                  title="Open UptimeRobot"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </div>
          </Card>
        )
      })}

      {editingId && (
        <MonitorFormDialog
          integrationId={integrationId}
          monitorId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); onChanged?.() }}
        />
      )}
    </div>
  )
}

export function IncidentList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-3">
      {items.map((incident, i) => {
        const tone = incident.type === 'down' ? 'danger' : 'success'
        return (
          <Card key={`${incident.monitor_id}-${incident.datetime}-${i}`} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
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
