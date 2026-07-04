import { ExternalLink, CheckCircle2, XCircle, Loader2, Database, GitBranch } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'

const STATUS_TONE = {
  finished: 'success',
  failed: 'danger',
  cancelled: 'warning',
  cancelling: 'warning',
  skipped: 'neutral',
  running: 'accent',
  scheduling: 'accent',
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

export function OperationList({ items, emptyMessage, integrationId }) {
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
                    {tone === 'danger'
                      ? <XCircle size={11} />
                      : tone === 'accent'
                      ? <Loader2 size={11} className="animate-spin" />
                      : <CheckCircle2 size={11} />}
                    {item.status}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{item.project_name}</span>
                  <span className="text-[11px] text-text-faint">{timeAgo(item.created_at)}</span>
                </div>
                <p className="text-[11px] text-text-faint">
                  Action: <span className="font-mono">{item.action || 'unknown'}</span>
                  {item.failures_count > 0 && (
                    <span className="ml-2 text-danger">
                      {item.failures_count} failure{item.failures_count === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {tone === 'danger' && integrationId && (
                  <AddToWatchlistButton
                    integrationId={integrationId}
                    provider="neon"
                    resourceType="operation"
                    externalId={item.id}
                    resourceName={item.project_name}
                    title={`Operation ${item.status} — ${item.project_name}`}
                    severity="high"
                    raw={item}
                  />
                )}
                <a
                  href="https://console.neon.tech"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-faint hover:text-accent transition-colors"
                  title="Open Neon"
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

export function ProjectList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((project) => (
        <Card key={project.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge tone="success"><Database size={11} /> active</Badge>
                <span className="text-sm font-medium text-text truncate">{project.name}</span>
                {project.pg_version && (
                  <span className="text-[11px] text-text-faint">PG {project.pg_version}</span>
                )}
              </div>
              <p className="text-[11px] text-text-faint truncate">
                {project.region_id}
                {project.compute_last_active_at
                  ? ` · last active ${timeAgo(project.compute_last_active_at)}`
                  : ''}
              </p>
            </div>
            <a
              href="https://console.neon.tech"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-text-faint hover:text-accent transition-colors"
              title="Open project"
            >
              <ExternalLink size={15} />
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function BranchList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((branch) => (
        <Card key={branch.id}>
          <div className="flex items-center gap-2">
            {branch.default
              ? <Badge tone="accent"><GitBranch size={11} /> default</Badge>
              : <Badge tone="neutral"><GitBranch size={11} /> branch</Badge>}
            <span className="text-sm font-medium text-text truncate">{branch.name}</span>
            {branch.protected && (
              <span className="text-[11px] text-text-faint">protected</span>
            )}
            <span className="ml-auto text-[11px] text-text-faint">{branch.current_state}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}
