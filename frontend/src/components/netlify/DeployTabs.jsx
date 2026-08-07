import { ExternalLink, CheckCircle2, XCircle, Lock, Globe, GitCommit, RotateCw, Ban, ScrollText } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AddToWatchlistButton } from '../watchlist/AddToWatchlistButton'
import { RemoteActionButton } from '../actions/RemoteActionButton'

const STATE_TONE = {
  ready: 'success',
  error: 'danger',
  rejected: 'danger',
  new: 'neutral',
  enqueued: 'neutral',
  building: 'accent',
  uploading: 'accent',
  uploaded: 'accent',
  processing: 'accent',
  processed: 'accent',
  preparing: 'accent',
  deploying: 'accent',
}

// Deploy states that are still running - cancel only makes sense while
// one of these. Mirrors NetlifySyncService.IN_PROGRESS_STATES
// (services/integrations/netlify/sync.py) and render/DeployTabs.jsx's
// IN_PROGRESS_STATUSES.
const IN_PROGRESS_STATES = new Set([
  'new', 'enqueued', 'building', 'uploading', 'uploaded',
  'processing', 'processed', 'preparing', 'deploying',
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

// Finds the most recent "ready" (published) deploy for this site that
// happened before the given deploy - i.e. the restore/rollback target.
// Returns null if there's nothing to roll back to.
function findRollbackTarget(item, allDeploys) {
  if (!allDeploys?.length) return null
  const sameSite = allDeploys.filter((d) => d.site_id === item.site_id)
  const before = sameSite.filter((d) => new Date(d.created_at) < new Date(item.created_at))
  return before.find((d) => d.state === 'ready') || null
}

export function DeployList({ items, emptyMessage, integrationId, allowRollback, allDeploys, onChanged }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const tone = STATE_TONE[item.state] || 'neutral'
        const rollbackTarget = allowRollback && integrationId ? findRollbackTarget(item, allDeploys) : null
        const cancellable = integrationId && IN_PROGRESS_STATES.has(item.state)

        return (
          <Card key={item.id} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={tone}>
                    {tone === 'danger' ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                    {item.state}
                  </Badge>
                  <span className="text-sm font-medium text-text truncate">{item.site_name}</span>
                  <span className="text-[11px] text-text-faint">{timeAgo(item.created_at)}</span>
                </div>
                {item.commit_ref && (
                  <p className="flex items-center gap-1.5 text-[11px] text-text-faint truncate">
                    <GitCommit size={12} />
                    {item.commit_ref.slice(0, 7)}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-text-faint">
                  Branch: <span className="font-mono">{item.branch || 'unknown'}</span>
                </p>
                {item.error_message && (
                  <p className="mt-0.5 text-[11px] text-danger truncate">{item.error_message}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {cancellable && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="netlify"
                    action="cancel"
                    resourceId={item.site_id}
                    resourceName={item.site_name}
                    extra={{ deploy_id: item.id }}
                    icon={Ban}
                    onDone={onChanged}
                  />
                )}
                {rollbackTarget && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="netlify"
                    action="rollback"
                    resourceId={item.site_id}
                    resourceName={item.site_name}
                    extra={{ deploy_id: rollbackTarget.id }}
                    onDone={onChanged}
                  />
                )}
                {tone === 'danger' && integrationId && (
                  <AddToWatchlistButton
                    integrationId={integrationId}
                    provider="netlify"
                    resourceType="deploy"
                    externalId={item.id}
                    resourceName={item.site_name}
                    title={`Deploy ${item.state} — ${item.site_name}`}
                    severity="high"
                    raw={item}
                  />
                )}
                {item.deploy_url && (
                  <a
                    href={item.deploy_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-faint hover:text-accent transition-colors"
                    title="Open deploy"
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

/**
 * selectedId  — id of the currently selected site
 * onSelect    — called with site object on card click
 * onViewLogs  — called with site object on Logs button click
 *
 * When selectedId is set only that card is rendered; all others are hidden.
 * Clicking the same card again (toggle) is handled by the parent. Mirrors
 * render/DeployTabs.jsx's ServiceList and vercel/DeployTabs.jsx's ProjectList.
 */
export function SiteList({ items, emptyMessage, integrationId, onChanged, onViewLogs, onSelect, selectedId }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  const visible = selectedId ? items.filter(s => s.id === selectedId) : items

  return (
    <div className="flex flex-col gap-2">
      {visible.map((site) => {
        const locked = !!site.locked
        const isSelected = site.id === selectedId
        return (
          <Card
            key={site.id}
            onClick={() => onSelect?.(site)}
            className={`cursor-pointer transition-colors ${
              isSelected
                ? 'border-accent/60 bg-accent-soft/10'
                : locked
                  ? 'border-warning/40 bg-warning-soft/20 hover:border-warning/60'
                  : 'hover:border-border/80'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  {locked
                    ? <Badge tone="warning"><Lock size={11} /> locked</Badge>
                    : <Badge tone={isSelected ? 'accent' : 'success'}><Globe size={11} /> active</Badge>}
                  <span className="text-sm font-medium text-text truncate">{site.name}</span>
                </div>
                {site.repo && (
                  <p className="text-[11px] text-text-faint truncate">
                    {site.repo}{site.branch ? ` · ${site.branch}` : ''}
                  </p>
                )}
              </div>

              {/* stop propagation so action buttons don't trigger card selection */}
              <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
                {onViewLogs && (
                  <Button variant="secondary" size="sm" onClick={() => onViewLogs(site)}>
                    <ScrollText size={13} /> Logs
                  </Button>
                )}
                {integrationId && !locked && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="netlify"
                    action="redeploy"
                    resourceId={site.id}
                    resourceName={site.name}
                    icon={RotateCw}
                    onDone={onChanged}
                  />
                )}
                {integrationId && (
                  <RemoteActionButton
                    integrationId={integrationId}
                    provider="netlify"
                    action={locked ? 'resume' : 'suspend'}
                    resourceId={site.id}
                    resourceName={site.name}
                    variant={locked ? 'secondary' : 'danger'}
                    icon={Lock}
                    onDone={onChanged}
                  />
                )}
                {site.url && (
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-text-faint hover:text-accent transition-colors"
                    title="Open site"
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

