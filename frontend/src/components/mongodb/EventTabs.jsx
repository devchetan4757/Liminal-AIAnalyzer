import { ExternalLink, ShieldAlert, Lock, UserCheck, Server, CheckCircle2, Info } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

const TONE_BY_BUCKET = {
  alerts:         'danger',
  access_events:  'warning',
  auth_events:    'accent',
  cluster_events: 'neutral',
  other_events:   'neutral',
}

const ICON_BY_BUCKET = {
  alerts:         ShieldAlert,
  access_events:  Lock,
  auth_events:    UserCheck,
  cluster_events: Server,
  other_events:   Info,
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

export function EventList({ items, bucket, emptyMessage }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />

  const tone = TONE_BY_BUCKET[bucket] || 'neutral'
  const Icon = ICON_BY_BUCKET[bucket] || Info

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Card key={item.id} className={tone === 'danger' ? 'border-danger/40 bg-danger-soft/20' : undefined}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge tone={tone}>
                  <Icon size={11} /> {item.type}
                </Badge>
                {item.username && (
                  <span className="font-mono text-xs text-text-faint">{item.username}</span>
                )}
                <span className="text-[11px] text-text-faint">{timeAgo(item.created)}</span>
              </div>
              {item.remote_address && (
                <p className="text-[11px] text-text-faint">
                  From <code className="font-mono">{item.remote_address}</code>
                </p>
              )}
            </div>
            <a
              href="https://cloud.mongodb.com"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-text-faint hover:text-accent transition-colors"
              title="Open Atlas"
            >
              <ExternalLink size={15} />
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}
