import { useEffect, useState } from 'react'
import { RefreshCw, Activity, XCircle, PauseCircle, CheckCircle2, Plus } from 'lucide-react'
import { getUptimeRobotStatus } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { MonitorList, IncidentList } from '../components/uptimerobot/MonitorTabs'
import { MonitorFormDialog } from '../components/uptimerobot/MonitorFormDialog'

const TABS = [
  { key: 'monitors',          label: 'Monitors',         statKey: 'total_monitors' },
  { key: 'down_monitors',     label: 'Down',             statKey: 'down_count' },
  { key: 'paused_monitors',   label: 'Paused',           statKey: 'paused_count' },
  { key: 'recent_incidents',  label: 'Recent Incidents', statKey: null },
]

const EMPTY_MESSAGE = {
  monitors:          'No monitors found for this account.',
  down_monitors:     'Nothing down right now — all green.',
  paused_monitors:   'No paused monitors.',
  recent_incidents:  'No recent up/down events.',
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

export default function UptimeRobotDashboard({ integration }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [tab, setTab]             = useState('monitors')
  const [showAddMonitor, setShowAddMonitor] = useState(false)

  const load = async (opts) => {
    setLoading(true)
    setError('')
    try {
      const result = await getUptimeRobotStatus(integration.id, opts)
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
        <p className="text-sm text-danger font-medium mb-1">Status fetch failed</p>
        <p className="text-sm text-text-dim">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => load()}>
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
            <Activity size={18} className="text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">{integration.display_name}</div>
            <div className="text-[11px] text-text-faint">
              UptimeRobot · Monitors & Incidents
              {data._cache && (
                <span>
                  {' '}· {data._cache.hit
                    ? `cached ${Math.round(data._cache.age_seconds / 60)}m ago`
                    : 'just refreshed'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowAddMonitor(true)}>
            <Plus size={14} />
            Add monitor
          </Button>
          <Button variant="secondary" size="sm" onClick={() => load({ refresh: true })} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* stats row */}
      <div className="flex flex-wrap gap-3 border-b border-border px-6 py-4">
        <StatCard label="Total Monitors" value={s.total_monitors} tone="neutral" icon={Activity} />
        <StatCard label="Down"           value={s.down_count}     tone={s.down_count   ? 'danger'  : 'success'} icon={XCircle} />
        <StatCard label="Paused"         value={s.paused_count}   tone={s.paused_count ? 'warning' : 'success'} icon={PauseCircle} />
        <StatCard label="Up"             value={s.up_count}       tone="success" icon={CheckCircle2} />
      </div>

      {/* tabs */}
      <div className="flex border-b border-border px-6">
        {TABS.map(t => {
          const count = t.statKey ? data.stats[t.statKey] : (data.recent_incidents || []).length
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
        {tab === 'recent_incidents'
          ? <IncidentList items={data.recent_incidents} emptyMessage={EMPTY_MESSAGE.recent_incidents} />
          : <MonitorList
              items={data[tab]}
              emptyMessage={EMPTY_MESSAGE[tab]}
              integrationId={integration.id}
              onChanged={() => load({ refresh: true })}
            />
        }
      </div>

      {showAddMonitor && (
        <MonitorFormDialog
          integrationId={integration.id}
          onClose={() => setShowAddMonitor(false)}
          onSaved={() => { setShowAddMonitor(false); load({ refresh: true }) }}
        />
      )}

    </div>
  )
}
