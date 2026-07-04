import { useEffect, useState } from 'react'
import {
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Sparkles,
  Cloud,
  Database,
  Activity,
  Github,
} from 'lucide-react'
import { getWatchlist, resolveWatchlistItem, deleteWatchlistItem } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'

const PROVIDER_ICON = {
  render: Cloud,
  neon: Database,
  uptimerobot: Activity,
  github: Github,
  mongodb: Database,
}

const PROVIDER_LINK = {
  render: 'https://dashboard.render.com',
  neon: 'https://console.neon.tech',
  uptimerobot: 'https://uptimerobot.com/dashboard',
  github: 'https://github.com',
  mongodb: 'https://cloud.mongodb.com',
}

function timeAgo(iso) {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function WatchlistItem({ item, onResolve, onDelete, busy }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = PROVIDER_ICON[item.provider] || Cloud
  const steps = item.recommendations || []

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              <Icon size={11} />
              {item.provider}
            </Badge>
            {item.has_playbook ? (
              <Badge tone="success">
                <ShieldCheck size={11} />
                Verified playbook
              </Badge>
            ) : (
              <Badge tone="warning">
                <Sparkles size={11} />
                AI suggestion
              </Badge>
            )}
            <span className="text-[11px] text-text-faint">{timeAgo(item.created_at)}</span>
          </div>

          <p className="text-sm font-medium text-text">{item.resource_name || item.title}</p>
          {item.summary && (
            <p className="mt-1 text-xs text-text-dim">{item.summary}</p>
          )}

          {steps.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? 'Hide steps' : `Show ${steps.length} step${steps.length === 1 ? '' : 's'}`}
              </button>
              {expanded && (
                <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4 text-xs text-text-dim">
                  {steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <a
            href={PROVIDER_LINK[item.provider] || '#'}
            target="_blank"
            rel="noreferrer"
            className="text-text-faint hover:text-accent transition-colors"
            title="Open provider dashboard"
          >
            <ExternalLink size={15} />
          </a>
          {item.status === 'open' ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResolve(item.id)}
                disabled={busy}
              >
                <CheckCircle2 size={13} />
                Resolve
              </Button>
              <button
                onClick={() => onDelete(item.id)}
                disabled={busy}
                title="Delete"
                className="text-text-faint hover:text-danger disabled:opacity-40 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onDelete(item.id)}
              disabled={busy}
              title="Delete"
              className="text-text-faint hover:text-danger disabled:opacity-40 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Watchlist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getWatchlist()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (id) => {
    setBusyId(id)
    try {
      await resolveWatchlistItem(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this item from the watchlist? This can\'t be undone.')) return
    setBusyId(id)
    try {
      await deleteWatchlistItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const open = items.filter((i) => i.status === 'open')
  const resolved = items.filter((i) => i.status === 'resolved')

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-accent" />
          <h1 className="text-xl font-semibold text-text">Watchlist</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-text-faint">
          Nothing here yet — add a failing item from any Connected App dashboard to track it here.
        </p>
      )}

      {open.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
            Open ({open.length})
          </h2>
          <div className="flex flex-col gap-2">
            {open.map((item) => (
              <WatchlistItem
                key={item.id}
                item={item}
                onResolve={handleResolve}
                onDelete={handleDelete}
                busy={busyId === item.id}
              />
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
            Resolved ({resolved.length})
          </h2>
          <div className="flex flex-col gap-2 opacity-70">
            {resolved.map((item) => (
              <WatchlistItem
                key={item.id}
                item={item}
                onResolve={handleResolve}
                onDelete={handleDelete}
                busy={busyId === item.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
