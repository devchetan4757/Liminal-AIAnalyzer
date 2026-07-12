import { useEffect, useRef, useState } from 'react'
import { X, RefreshCw, ScrollText, Circle } from 'lucide-react'
import { Button } from '../ui/Button'
import { getRenderServiceLogs } from '../../api/client'

const POLL_MS = 7500

const LEVEL_COLOR = {
  error: 'text-red-400',
  warn: 'text-amber-400',
  warning: 'text-amber-400',
  info: 'text-sky-400',
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

// Newest first. Falls back to id order if timestamps are missing/equal.
function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
    if (tb !== ta) return tb - ta
    return (b.id || '').localeCompare(a.id || '')
  })
}

/**
 * On-demand, live-tailing log view for a single service. Fetch only
 * starts once the user opens this panel (not part of the dashboard's
 * passive status poll), and stops the moment it's closed. While open,
 * it re-fetches on an interval so new lines keep streaming in without
 * the user having to hit refresh - newest line always at the top.
 */
export function ServiceLogsPanel({ integrationId, serviceId, serviceName, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [live, setLive] = useState(true)
  const seenIds = useRef(new Set())
  const intervalRef = useRef(null)

  const load = async (isPoll = false) => {
    if (!isPoll) setLoading(true)
    setError('')
    try {
      const result = await getRenderServiceLogs(integrationId, serviceId, { limit: 200 })
      const incoming = result.logs || []
      incoming.forEach((l) => seenIds.current.add(l.id))
      setLogs(sortNewestFirst(incoming))
    } catch (err) {
      setError(err.message)
    } finally {
      if (!isPoll) setLoading(false)
    }
  }

  useEffect(() => {
    seenIds.current = new Set()
    load(false)
  }, [integrationId, serviceId])

  useEffect(() => {
    if (!live) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(intervalRef.current)
  }, [live, integrationId, serviceId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <ScrollText size={16} className="text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-text">Logs</h2>
              <p className="text-[11px] text-text-faint truncate max-w-[380px]">{serviceName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLive((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                live
                  ? 'border-success/40 bg-success-soft/20 text-success'
                  : 'border-border text-text-faint hover:text-text'
              }`}
              title={live ? `Polling every ${POLL_MS / 1000}s` : 'Live updates paused'}
            >
              <Circle size={7} className={live ? 'fill-current animate-pulse' : 'fill-current'} />
              {live ? 'Live' : 'Paused'}
            </button>
            <Button variant="secondary" size="sm" onClick={() => load(false)} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <button onClick={onClose} className="text-text-faint hover:text-text">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#0b0e11] px-4 py-3 font-mono text-[12px] leading-relaxed">
          {loading && (
            <div className="flex flex-col gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-white/5" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-danger/40 bg-danger-soft/20 p-3 text-danger">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <p className="py-8 text-center text-white/40">No log lines returned for this service yet.</p>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="flex flex-col">
              {logs.map((line) => (
                <div
                  key={line.id}
                  className="flex items-start gap-3 border-b border-white/5 px-1 py-0.5 hover:bg-white/[0.03]"
                >
                  <span className="shrink-0 text-white/35 select-none">{formatTime(line.timestamp)}</span>
                  {line.level && (
                    <span className={`shrink-0 w-12 uppercase text-[10px] font-bold ${LEVEL_COLOR[line.level] || 'text-white/50'}`}>
                      {line.level}
                    </span>
                  )}
                  <span className="whitespace-pre-wrap break-all text-white/85">{line.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-2 text-[10px] text-text-faint">
          {live ? `Auto-refreshing every ${POLL_MS / 1000}s while this panel is open` : 'Live updates paused'} · newest first
        </div>
      </div>
    </div>
  )
}
