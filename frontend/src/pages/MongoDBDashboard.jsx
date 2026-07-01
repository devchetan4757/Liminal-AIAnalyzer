import { useEffect, useState } from 'react'
import { RefreshCw, Database, ShieldAlert, Lock, UserCheck, Server } from 'lucide-react'
import { getMongoLogs } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EventList } from '../components/mongodb/EventTabs'

const TABS = [
  { key: 'alerts',         label: 'Alerts',         statKey: 'alert_count' },
  { key: 'access_events',  label: 'Access Events',  statKey: 'access_event_count' },
  { key: 'auth_events',    label: 'Auth Events',     statKey: 'auth_event_count' },
  { key: 'cluster_events', label: 'Cluster Events',  statKey: 'cluster_event_count' },
  { key: 'other_events',   label: 'Other',          statKey: null },
]

const EMPTY_MESSAGE = {
  alerts:         'No active alerts on this project.',
  access_events:  'No network/IP access-list or DB user changes recently.',
  auth_events:    'No login or membership events recently.',
  cluster_events: 'No cluster or maintenance events recently.',
  other_events:   'Nothing else to show.',
}

function StatCard({ label, value, tone = 'neutral', icon: Icon }) {
  const colours = {
    neutral: 'text-text-dim',
    warning: 'text-warning',
    danger:  'text-danger',
    success: 'text-success',
  }
  return (
    <Card className="flex flex-col gap-1 min-w-[120px]">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${colours[tone]}`}>
        <Icon size={14} /> {label}
      </div>
      <div className="font-mono text-2xl font-bold text-text">{value}</div>
    </Card>
  )
}

export default function MongoDBDashboard({ integration }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState('alerts')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getMongoLogs(integration.id)
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [integration.id])

  if (loading) return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-20 w-32 animate-pulse rounded-lg bg-bg-inset" />
        ))}
      </div>
      <div className="flex flex-col gap-2 mt-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-inset" />
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <Card className="border-danger/40 bg-danger-soft/20">
        <p className="text-sm text-danger font-medium mb-1">Log fetch failed</p>
        <p className="text-sm text-text-dim">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
          Retry
        </Button>
      </Card>
    </div>
  )

  const s = data.stats

  return (
    <div className="flex h-full flex-col overflow-y-auto">

      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-inset">
            <Database size={18} className="text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">{integration.display_name}</div>
            <div className="text-[11px] text-text-faint">MongoDB Atlas · Project Activity</div>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* stats row */}
      <div className="flex flex-wrap gap-3 border-b border-border px-6 py-4">
        <StatCard label="Total Events"   value={s.total_events}         tone="neutral" icon={Database} />
        <StatCard label="Alerts"         value={s.alert_count}          tone={s.alert_count         ? 'danger'  : 'success'} icon={ShieldAlert} />
        <StatCard label="Access Events"  value={s.access_event_count}   tone={s.access_event_count  ? 'warning' : 'success'} icon={Lock} />
        <StatCard label="Auth Events"    value={s.auth_event_count}     tone="neutral" icon={UserCheck} />
        <StatCard label="Cluster Events" value={s.cluster_event_count}  tone="neutral" icon={Server} />
      </div>

      {/* tabs */}
      <div className="flex border-b border-border px-6">
        {TABS.map(t => {
          const count = t.statKey ? data.stats[t.statKey] : null
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-faint hover:text-text'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  tab === t.key ? 'bg-accent-soft text-accent' : 'bg-bg-inset text-text-dim'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <EventList items={data[tab]} bucket={tab} emptyMessage={EMPTY_MESSAGE[tab]} />
      </div>

    </div>
  )
}
