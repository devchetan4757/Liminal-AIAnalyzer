import { ExternalLink, CheckCircle2, XCircle, Triangle, GitCommit, RotateCw, Ban, ArrowUpCircle, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'
import { RemoteActionButton } from '../actions/RemoteActionButton'

const STATUS_TONE = {
  READY: 'success',
  ERROR: 'danger',
  CANCELED: 'warning',
  BUILDING: 'accent',
  QUEUED: 'neutral',
  INITIALIZING: 'accent',
}

// Deployments still running - cancel only makes sense while one of these.
const IN_PROGRESS_STATES = new Set(['QUEUED', 'BUILDING', 'INITIALIZING'])

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

export function DeploymentList({ items, emptyMessage, integrationId, onChanged }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const tone = STATUS_TONE[item.state] || 'neutral'
        const cancellable = integrationId && IN_PROGRESS_STATES.has(item.state)
        const isPreview = item.target !== 'production'

        return (
          <Card key={item.id} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}>
                    {tone === 'danger' ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                    {item.state}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{item.project_name}</span>
                  <span className="text-[11px] text-text-faint capitalize">{item.target || 'preview'}</span>
                  <span className="text-[11px] text-text-faint">{timeAgo(item.created_at)}</span>
                </div>
                {item.commit_message && (
                  <p className="flex items-center gap-1.5 text-[11px] text-text-faint truncate">
                    <GitCommit size={12} />
                    {item.commit_message}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {cancellable && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="vercel"
                    action="cancel_deployment"
                    resourceId={item.id}
                    resourceName={item.project_name}
                    icon={Ban}
                    onDone={onChanged}
                  />
                )}
                {integrationId && item.state === 'READY' && isPreview && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="vercel"
                    action="promote"
                    resourceId={item.id}
                    resourceName={item.project_name}
                    extra={{ project_id: item.project_id }}
                    variant="secondary"
                    icon={ArrowUpCircle}
                    onDone={onChanged}
                  />
                )}
                {integrationId && item.state === 'READY' && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="vercel"
                    action="redeploy"
                    resourceId={item.id}
                    resourceName={item.project_name}
                    icon={RotateCw}
                    onDone={onChanged}
                  />
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="vercel"
                    action="delete_deployment"
                    resourceId={item.id}
                    resourceName={item.project_name}
                    variant="danger"
                    icon={Trash2}
                    onDone={onChanged}
                  />
                )}
                {tone === 'danger' && integrationId && (
                  <AddToWatchlistButton
                    integrationId={integrationId}
                    provider="vercel"
                    resourceType="deployment"
                    externalId={item.id}
                    resourceName={item.project_name}
                    title={`Deployment ${item.state} — ${item.project_name}`}
                    severity="high"
                    raw={item}
                  />
                )}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-faint hover:text-accent transition-colors"
                    title="Open deployment"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function ProjectList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((project) => {
        const tone = STATUS_TONE[project.latest_deployment_state] || 'neutral'
        return (
          <Card key={project.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}>
                    <Triangle size={10} />
                    {project.latest_deployment_state || 'no deploys'}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{project.name}</span>
                  {project.framework && (
                    <span className="text-[11px] text-text-faint capitalize">{project.framework}</span>
                  )}
                </div>
              </div>
              {project.url && (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-text-faint hover:text-accent transition-colors"
                  title="Open project"
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
