import { useEffect, useState } from 'react'
import { History, RefreshCw, X, Trash2 } from 'lucide-react'
import { getHistory, getAnalysisById, deleteAnalysis } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import VerdictBadge from '../components/VerdictBadge'
import AnalysisCard from '../components/AnalysisCard'

const VERDICT_FILTERS = ['all', 'malicious', 'suspicious', 'clean', 'unknown']

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verdictFilter, setVerdictFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getHistory({
        verdict: verdictFilter === 'all' ? undefined : verdictFilter,
      })
      setItems(Array.isArray(data) ? data : [])
      if (!Array.isArray(data)) {
        console.warn('Unexpected /api/history response shape:', data)
        setError('Unexpected response from server — check console.')
      }
    } catch (err) {
      setError(err.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictFilter])

  const openItem = async (id) => {
    setSelectedLoading(true)
    try {
      const full = await getAnalysisById(id)
      setSelected(full)
    } catch (err) {
      setError(err.message)
    } finally {
      setSelectedLoading(false)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation() // don't trigger openItem when clicking the trash icon
    if (!confirm('Delete this analysis from history? This can\'t be undone.')) return

    setDeletingId(id)
    try {
      await deleteAnalysis(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Analysis History</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {VERDICT_FILTERS.map((v) => (
          <button
            key={v}
            onClick={() => setVerdictFilter(v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              verdictFilter === v
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-text-dim hover:border-accent/40'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 text-sm text-danger">{error}</p>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-text-faint">
          No analyses yet — run a lookup from the Chat tab and it'll show up here.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Card
            key={item.id}
            className="cursor-pointer hover:border-accent/40 transition-colors"
            onClick={() => openItem(item.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <VerdictBadge verdict={item.verdict} />
                  <span className="truncate font-mono text-xs text-text-dim">
                    {item.indicator}
                  </span>
                </div>
                {item.headline && (
                  <p className="mt-1 truncate text-xs text-text-faint">
                    {item.headline}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-text-faint">
                {new Date(item.created_at).toLocaleString()}
              </span>
              <button
                onClick={(e) => handleDelete(item.id, e)}
                disabled={deletingId === item.id}
                title="Delete"
                className="shrink-0 text-text-faint hover:text-danger disabled:opacity-40 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-bg-raised border border-border text-text-dim hover:text-text"
            >
              <X size={14} />
            </button>
            <AnalysisCard data={selected} />
          </div>
        </div>
      )}

      {selectedLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <span className="text-sm text-text-dim font-mono">Loading…</span>
        </div>
      )}
    </div>
  )
}
