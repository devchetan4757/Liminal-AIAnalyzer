import { ExternalLink, FileWarning, KeyRound, FolderOpen, CheckCircle2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

const SEVERITY_TONE = {
  critical: 'danger',
  high:     'danger',
  medium:   'warning',
  low:      'accent',
  unknown:  'neutral',
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

export function EnvPushes({ items }) {
  if (!items.length) return <EmptyState message="No sensitive file pushes detected in the last 30 days." />
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <Card key={i} className="border-warning/40 bg-warning-soft/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="font-mono text-xs font-semibold text-text">{item.repo}</span>
                <code className="text-[11px] text-text-faint bg-bg-inset px-1.5 py-0.5 rounded">
                  {item.sha}
                </code>
                <span className="text-[11px] text-text-faint">
                  {item.author} · {timeAgo(item.timestamp)}
                </span>
              </div>
              <p className="text-sm text-text-dim truncate mb-2">{item.message}</p>
              <div className="flex flex-wrap gap-1">
                {item.files.map((f, j) => (
                  <Badge key={j} tone="warning">
                    <FileWarning size={11} /> {f}
                  </Badge>
                ))}
              </div>
            </div>
            <a href={item.url} target="_blank" rel="noreferrer"
               className="shrink-0 text-text-faint hover:text-accent transition-colors">
              <ExternalLink size={15} />
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function SecretAlerts({ items }) {
  if (!items.length) return <EmptyState message="No secret scanning alerts found." />
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <Card key={i} className="border-danger/40 bg-danger-soft/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge tone="danger">
                  <KeyRound size={11} /> {item.secret_type}
                </Badge>
                <span className="font-mono text-xs text-text-faint">{item.repo}</span>
              </div>
              <p className="text-[11px] text-text-faint mt-1">
                Detected {timeAgo(item.created_at)}
              </p>
            </div>
            <a href={item.url} target="_blank" rel="noreferrer"
               className="shrink-0 text-text-faint hover:text-accent transition-colors">
              <ExternalLink size={15} />
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function DepAlerts({ items }) {
  if (!items.length) return <EmptyState message="No open Dependabot alerts." />
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <Card key={i}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge tone={SEVERITY_TONE[item.severity] || 'neutral'}>
                  {item.severity}
                </Badge>
                <span className="font-mono text-xs font-semibold text-text">{item.package}</span>
                <span className="text-[11px] text-text-faint">{item.repo}</span>
              </div>
              <p className="text-sm text-text-dim">{item.summary}</p>
              {item.fixed_in && (
                <p className="mt-1 text-[11px] text-success">Fix available in v{item.fixed_in}</p>
              )}
            </div>
            <a href={item.url} target="_blank" rel="noreferrer"
               className="shrink-0 text-text-faint hover:text-accent transition-colors">
              <ExternalLink size={15} />
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function ExposedRepos({ items }) {
  if (!items.length) return <EmptyState message="All public repos have a .gitignore." />
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <Card key={i} className="border-warning/40">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-warning shrink-0" />
              <div>
                <span className="font-mono text-sm text-text">{item.repo}</span>
                <p className="text-[11px] text-text-faint mt-0.5">
                  Public · No .gitignore detected
                  {item.language ? ` · ${item.language}` : ''}
                </p>
              </div>
            </div>
            <a href={item.url} target="_blank" rel="noreferrer"
               className="shrink-0 text-text-faint hover:text-accent transition-colors">
              <ExternalLink size={15} />
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}
