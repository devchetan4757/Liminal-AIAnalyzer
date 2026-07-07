import { ExternalLink, CheckCircle2, XCircle, Loader2, Zap, GitBranch } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'

const STATUS_TONE = {
  ACTIVE_HEALTHY: 'success',
  ACTIVE_UNHEALTHY: 'danger',
  INIT_FAILED: 'danger',
  RESTORE_FAILED: 'danger',
  PAUSE_FAILED: 'danger',
  UNKNOWN: 'danger',
  REMOVED: 'danger',
  COMING_UP: 'accent',
  RESTORING: 'accent',
  UPGRADING: 'accent',
  RESIZING: 'accent',
  PAUSING: 'warning',
  GOING_DOWN: 'warning',
  INACTIVE: 'neutral',
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

export function ProjectList({ items, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((project) => {
        const tone = STATUS_TONE[project.status] || 'neutral'
        return (
          <Card key={project.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}><Zap size={11} /> {(project.status || 'unknown').toLowerCase()}</Badge>
                  <span className="text-sm font-medium text-text truncate">{project.name}</span>
                  {project.region && (
                    <span className="text-[11px] text-text-faint">{project.region}</span>
                  )}
                </div>
                <p className="text-[11px] text-text-faint truncate">
                  created {timeAgo(project.created_at)}
                </p>
              </div>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-text-faint hover:text-accent transition-colors"
                title="Open project"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </Card>
        )
      })}
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
            {branch.is_default
              ? <Badge tone="accent"><GitBranch size={11} /> default</Badge>
              : <Badge tone="neutral"><GitBranch size={11} /> branch</Badge>}
            <span className="text-sm font-medium text-text truncate">{branch.name}</span>
            {branch.git_branch && (
              <span className="text-[11px] text-text-faint">{branch.git_branch}</span>
            )}
            <span className="ml-auto text-[11px] text-text-faint">{branch.status}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function UnhealthyProjectList({ items, emptyMessage, integrationId }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((project) => (
        <Card key={project.id} className="border-danger/40 bg-danger-soft/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge tone="danger">
                  {project.status === 'UNKNOWN'
                    ? <Loader2 size={11} className="animate-spin" />
                    : <XCircle size={11} />}
                  {(project.status || 'unknown').toLowerCase()}
                </Badge>
                <span className="text-sm font-medium text-text truncate">{project.name}</span>
                <span className="text-[11px] text-text-faint">{timeAgo(project.created_at)}</span>
              </div>
              <p className="text-[11px] text-text-faint">
                {project.region || 'unknown region'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {integrationId && (
                <AddToWatchlistButton
                  integrationId={integrationId}
                  provider="supabase"
                  resourceType="project"
                  externalId={project.id}
                  resourceName={project.name}
                  title={`Project ${(project.status || 'unknown').toLowerCase()} — ${project.name}`}
                  severity="high"
                  raw={project}
                />
              )}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-text-faint hover:text-accent transition-colors"
                title="Open Supabase"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
