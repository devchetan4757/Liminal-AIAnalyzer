import { useState } from 'react'
import {
  ChevronDown, ExternalLink, Star, GitFork,
  AlertCircle, Globe, Lock, GitBranch,
} from 'lucide-react'
import { getRepoPeek } from '../../api/client'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

const LANG_COLORS = [
  'bg-accent', 'bg-warning', 'bg-danger', 'bg-blue-400', 'bg-purple-400',
]

function timeAgo(iso) {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function RepoCard({ repo, integrationId }) {
  const [open, setOpen]       = useState(false)
  const [peek, setPeek]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleClick = async () => {
    setOpen(o => !o)
    if (peek || loading) return
    setLoading(true)
    setError('')
    try {
      const data = await getRepoPeek(integrationId, repo.full_name)
      setPeek(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const langTotal = peek
    ? Object.values(peek.languages).reduce((a, b) => a + b, 0)
    : 0

  return (
    <Card className={`transition-all ${open ? 'border-accent/40' : ''}`}>
      {/* always-visible header row */}
      <button className="w-full text-left" onClick={handleClick}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {repo.private
              ? <Lock size={13} className="shrink-0 text-text-faint" />
              : <Globe size={13} className="shrink-0 text-text-faint" />}
            <span className="font-mono text-sm font-medium text-text truncate">
              {repo.name}
            </span>
            {repo.language && <Badge tone="neutral">{repo.language}</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px] text-text-faint">
            <span className="flex items-center gap-1"><Star size={11} /> {repo.stars}</span>
            <span className="flex items-center gap-1"><GitFork size={11} /> {repo.forks}</span>
            {repo.open_issues > 0 && (
              <span className="flex items-center gap-1 text-warning">
                <AlertCircle size={11} /> {repo.open_issues}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </button>

      {/* expanded peek */}
      {open && (
        <div className="mt-4 border-t border-border pt-4">

          {loading && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-8 animate-pulse rounded bg-bg-inset" />
              ))}
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {peek && (
            <div className="flex flex-col gap-5">

              {peek.description && (
                <p className="text-sm text-text-dim">{peek.description}</p>
              )}

              {peek.topics?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {peek.topics.map(t => (
                    <Badge key={t} tone="accent">{t}</Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-[11px] text-text-faint">
                <span>
                  Branch: <code className="font-mono text-text-dim">{peek.default_branch}</code>
                </span>
                <span>Created: {new Date(peek.created_at).toLocaleDateString()}</span>
                <span>Updated: {timeAgo(peek.updated_at)}</span>
              </div>

              {/* language bar */}
              {langTotal > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-text-faint">Languages</p>
                  <div className="flex h-2 w-full overflow-hidden rounded-full gap-0.5">
                    {Object.entries(peek.languages).map(([lang, bytes], i) => (
                      <div
                        key={lang}
                        className={`${LANG_COLORS[i % LANG_COLORS.length]} rounded-full`}
                        style={{ width: `${(bytes / langTotal) * 100}%` }}
                        title={`${lang}: ${((bytes / langTotal) * 100).toFixed(1)}%`}
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {Object.entries(peek.languages).map(([lang, bytes], i) => (
                      <span key={lang} className="flex items-center gap-1 text-[11px] text-text-faint">
                        <span className={`h-2 w-2 rounded-full ${LANG_COLORS[i % LANG_COLORS.length]}`} />
                        {lang} {((bytes / langTotal) * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* branches */}
              {peek.branches?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-text-faint">Branches</p>
                  <div className="flex flex-wrap gap-1">
                    {peek.branches.map(b => (
                      <Badge key={b} tone={b === peek.default_branch ? 'accent' : 'neutral'}>
                        <GitBranch size={10} /> {b}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* contributors */}
              {peek.contributors?.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium text-text-faint">Top Contributors</p>
                  <div className="flex flex-col gap-1.5">
                    {peek.contributors.map(c => (
                      <a key={c.login} href={c.url} target="_blank" rel="noreferrer"
                         className="flex items-center gap-2 hover:text-accent transition-colors">
                        <img src={c.avatar} alt={c.login}
                             className="h-5 w-5 rounded-full bg-bg-inset" />
                        <span className="font-mono text-xs text-text">{c.login}</span>
                        <span className="text-[11px] text-text-faint">{c.contributions} commits</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* recent commits */}
              {peek.commits?.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium text-text-faint">Recent Commits</p>
                  <div className="flex flex-col gap-1.5">
                    {peek.commits.map(c => (
                      <a key={c.sha} href={c.url} target="_blank" rel="noreferrer"
                         className="flex items-center gap-2 group hover:text-accent transition-colors">
                        <code className="shrink-0 font-mono text-[11px] text-text-faint group-hover:text-accent">
                          {c.sha}
                        </code>
                        <span className="truncate text-xs text-text-dim">{c.message}</span>
                        <span className="shrink-0 text-[11px] text-text-faint ml-auto">
                          {timeAgo(c.timestamp)}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <a href={peek.url} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1 text-xs text-accent hover:underline">
                Open on GitHub <ExternalLink size={11} />
              </a>

            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function Repositories({ repos, integrationId }) {
  if (!repos?.length) return (
    <div className="flex items-center gap-2 py-8 text-sm text-success">
      No repositories found.
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      {repos.map(repo => (
        <RepoCard key={repo.id} repo={repo} integrationId={integrationId} />
      ))}
    </div>
  )
}
