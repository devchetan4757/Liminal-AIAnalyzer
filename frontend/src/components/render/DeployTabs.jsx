import { ExternalLink, CheckCircle2, XCircle, PauseCircle, PlayCircle, Cloud, GitCommit, RotateCw, Ban, Layers, Terminal, Trash2, ScrollText } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'
import { RemoteActionButton } from '../actions/RemoteActionButton'

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

// Deploys still running - cancel only makes sense while one of these.
const IN_PROGRESS_STATUSES = new Set([
  'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress', 'deploying', 'queued', 'created',
])

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

// Finds the most recent "live" deploy for this service that happened
// before the given deploy - i.e. the rollback target. Returns null if
// there's nothing to roll back to (no prior successful deploy known).
function findRollbackTarget(item, allDeploys) {
  if (!allDeploys?.length) return null
  const sameService = allDeploys.filter((d) => d.service_id === item.service_id)
  const before = sameService.filter((d) => new Date(d.created_at) < new Date(item.created_at))
  return before.find((d) => d.status === 'live') || null
}

export function DeployList({ items, emptyMessage, integrationId, allowRollback, allDeploys, onChanged }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const tone = STATUS_TONE[item.status] || 'neutral'
        const rollbackTarget = allowRollback && integrationId ? findRollbackTarget(item, allDeploys) : null
        const cancellable = integrationId && IN_PROGRESS_STATUSES.has(item.status)

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
                {cancellable && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="cancel_deploy"
                    resourceId={item.service_id}
                    resourceName={item.service_name}
                    extra={{ deploy_id: item.id }}
                    icon={Ban}
                    onDone={onChanged}
                  />
                )}
                {rollbackTarget && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="rollback"
                    resourceId={item.service_id}
                    resourceName={item.service_name}
                    extra={{ deploy_id: rollbackTarget.id }}
                    onDone={onChanged}
                  />
                )}
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

export function ServiceList({ items, emptyMessage, integrationId, onChanged, onViewLogs }) {
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
              <div className="flex shrink-0 items-center gap-2">
                {onViewLogs && (
                  <Button variant="secondary" size="sm" onClick={() => onViewLogs(svc)}>
                    <ScrollText size={13} />
                    View logs
                  </Button>
                )}
                {integrationId && !suspended && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="redeploy"
                    resourceId={svc.id}
                    resourceName={svc.name}
                    icon={RotateCw}
                    onDone={onChanged}
                  />
                )}
                {integrationId && !suspended && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="restart"
                    resourceId={svc.id}
                    resourceName={svc.name}
                    icon={RotateCw}
                    onDone={onChanged}
                  />
                )}
                {integrationId && !suspended && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="scale"
                    resourceId={svc.id}
                    resourceName={svc.name}
                    icon={Layers}
                    fields={[{ key: 'num_instances', label: 'Number of instances (1-100)', type: 'number', min: 1, max: 100, placeholder: 'e.g. 2' }]}
                    onDone={onChanged}
                  />
                )}
                {integrationId && !suspended && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="run_job"
                    resourceId={svc.id}
                    resourceName={svc.name}
                    icon={Terminal}
                    fields={[{ key: 'start_command', label: 'Shell command to run', type: 'text', placeholder: 'e.g. python manage.py migrate' }]}
                    onDone={onChanged}
                  />
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action={suspended ? 'resume' : 'suspend'}
                    resourceId={svc.id}
                    resourceName={svc.name}
                    variant={suspended ? 'secondary' : 'danger'}
                    icon={suspended ? PlayCircle : PauseCircle}
                    onDone={onChanged}
                  />
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="render"
                    action="delete"
                    resourceId={svc.id}
                    resourceName={svc.name}
                    variant="danger"
                    icon={Trash2}
                    onDone={onChanged}
                  />
                )}
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
            </div>
          </Card>
        )
      })}
    </div>
  )
}
