import { useEffect, useState } from 'react'
import { X, RefreshCw, ScrollText } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { getRenderServiceLogs } from '../../api/client'

const LEVEL_TONE = {
  error: 'danger',
  warn: 'warning',
  warning: 'warning',
  info: 'neutral',
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/**
 * On-demand log view for a single service. Only fetched when the user
 * clicks "View logs" on a service - not part of the dashboard's
 * passive status poll (which only carries deploy/suspension stats).
 */
export function ServiceLogsPanel({ integrationId, serviceId, serviceName, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getRenderServiceLogs(integrationId, serviceId, { limit: 200 })
      setLogs(result.logs || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [integrationId, serviceId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <ScrollText size={16} className="text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-text">Logs</h2>
              <p className="text-[11px] text-text-faint truncate max-w-[420px]">{serviceName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <button onClick={onClose} className="text-text-faint hover:text-text">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[11px]">
          {loading && (
            <div className="flex flex-col gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-bg-inset" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-danger/40 bg-danger-soft/20 p-3 text-danger">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <p className="py-8 text-center text-text-faint">No log lines returned for this service yet.</p>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="flex flex-col gap-1">
              {logs.map((line) => (
                <div key={line.id} className="flex items-start gap-2 border-b border-border/40 py-1">
                  <span className="shrink-0 text-text-faint">{formatTime(line.timestamp)}</span>
                  {line.level && (
                    <Badge tone={LEVEL_TONE[line.level] || 'neutral'}>{line.level}</Badge>
                  )}
                  <span className="whitespace-pre-wrap break-all text-text">{line.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
