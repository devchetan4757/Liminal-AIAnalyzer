import { ExternalLink, CheckCircle2, XCircle, PauseCircle, Cloud, GitCommit } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'

const STATUS_TONE = {
  live: 'success',
  build_failed: 'danger',
  update_failed: 'danger',
  canceled: 'warning',
  deactivated: 'warning',
  build_in_progress: 'accent',
  update_in_progress: 'accent',
  pre_deploy_in_progress: 'accent',
  deploying: 'accent',
  queued: 'neutral',
  created: 'neutral',
}

function timeAgo(iso) {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
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

export function DeployList({ items, emptyMessage, integrationId }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const tone = STATUS_TONE[item.status] || 'neutral'
        return (
          <Card key={item.id} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}>
                    {tone === 'danger' ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                    {item.status}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{item.service_name}</span>
                  <span className="text-[11px] text-text-faint">{timeAgo(item.created_at)}</span>
                </div>
                {item.commit_message && (
                  <p className="flex items-center gap-1.5 text-[11px] text-text-faint truncate">
                    <GitCommit size={12} />
                    {item.commit_message}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-text-faint">
                  Trigger: <span className="font-mono">{item.trigger || 'unknown'}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {tone === 'danger' && integrationId && (
                  <AddToWatchlistButton
                    integrationId={integrationId}
                    provider="render"
                    resourceType="deploy"
                    externalId={item.id}
                    resourceName={item.service_name}
                    title={`Deploy ${item.status} — ${item.service_name}`}
                    severity="high"
                    raw={item}
                  />
                )}
                <a
                  href="https://dashboard.render.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-faint hover:text-accent transition-colors"
                  title="Open Render"
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

export function ServiceList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((svc) => {
        const suspended = svc.suspended && svc.suspended !== 'not_suspended'
        return (
          <Card key={svc.id} className={suspended ? 'border-warning/40 bg-warning-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  {suspended
                    ? <Badge tone="warning"><PauseCircle size={11} /> suspended</Badge>
                    : <Badge tone="success"><Cloud size={11} /> active</Badge>}
                  <span className="text-sm font-medium text-text truncate">{svc.name}</span>
                  <span className="text-[11px] text-text-faint capitalize">{svc.type?.replace(/_/g, ' ')}</span>
                </div>
                {svc.repo && (
                  <p className="text-[11px] text-text-faint truncate">
                    {svc.repo}{svc.branch ? ` · ${svc.branch}` : ''}
                  </p>
                )}
              </div>
              {svc.url && (
                <a
                  href={svc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-text-faint hover:text-accent transition-colors"
                  title="Open service"
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
