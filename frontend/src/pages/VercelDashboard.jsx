import { useEffect, useState } from 'react'
import { RefreshCw, Triangle, XCircle, Layers, Plus } from 'lucide-react'
import { getVercelStatus } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { DeploymentList, ProjectList } from '../components/vercel/DeployTabs'
import { ProjectFormDialog } from '../components/vercel/ProjectFormDialog'
import { DeploymentLogsPanel } from '../components/vercel/DeploymentLogsPanel'
import { ProjectMetricsPanel } from '../components/vercel/ProjectMetricsPanel'

const TABS = [
  { key: 'projects',           label: 'Projects',           statKey: 'total_projects' },
  { key: 'recent_deployments', label: 'Recent Deployments', statKey: 'recent_deployment_count' },
  { key: 'failed_deployments', label: 'Failed Deployments', statKey: 'failed_deployment_count' },
]

const EMPTY_MESSAGE = {
  projects:            'No projects found for this account.',
  recent_deployments:  'No recent deployment activity.',
  failed_deployments:  'No failed deployments — all green.',
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

export default function VercelDashboard({ integration }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState('projects')
  const [showNewProject, setShowNewProject] = useState(false)
  const [logsProject, setLogsProject]       = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)

  const load = async (opts) => {
    setLoading(true)
    setError('')
    try {
      const result = await getVercelStatus(integration.id, opts)
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [integration.id])

  const handleTabChange = (key) => {
    setTab(key)
    if (key !== 'projects') setSelectedProject(null)
  }

  const handleSelectProject = (project) => {
    // toggle: clicking the already-selected card collapses metrics
    setSelectedProject(prev => prev?.id === project.id ? null : project)
  }

  if (loading) return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex gap-3">
        {[1,2,3].map(i => (
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
            <Triangle size={16} className="text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">{integration.display_name}</div>
            <div className="text-[11px] text-text-faint">
              Vercel · Projects & Deployments
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
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowNewProject(true)}>
            <Plus size={14} /> New project
          </Button>
          <Button variant="secondary" size="sm" onClick={() => load({ refresh: true })} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* stats row */}
      <div className="flex flex-wrap gap-3 border-b border-border px-6 py-4">
        <StatCard label="Total Projects"    value={s.total_projects}           tone="neutral" icon={Layers} />
        <StatCard label="Failed Deploys"    value={s.failed_deployment_count}  tone={s.failed_deployment_count ? 'danger' : 'success'} icon={XCircle} />
        <StatCard label="Recent Deploys"    value={s.recent_deployment_count}  tone="neutral" icon={Triangle} />
      </div>

      {/* tabs */}
      <div className="flex border-b border-border px-6">
        {TABS.map(t => {
          const count = t.statKey ? data.stats[t.statKey] : null
          return (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
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
        {tab === 'projects' ? (
          <>
            <ProjectList
              items={data.projects}
              emptyMessage={EMPTY_MESSAGE.projects}
              integrationId={integration.id}
              onViewLogs={project => setLogsProject(project)}
              onSelect={handleSelectProject}
              selectedId={selectedProject?.id}
            />

            {/* Metrics expand below the selected project card, full width */}
            {selectedProject && (
              <div className="mt-3">
                <ProjectMetricsPanel
                  integrationId={integration.id}
                  projectId={selectedProject.id}
                  projectName={selectedProject.name}
                  framework={selectedProject.framework}
                  onClose={() => setSelectedProject(null)}
                />
              </div>
            )}
          </>
        ) : (
          <DeploymentList
            items={data[tab]}
            emptyMessage={EMPTY_MESSAGE[tab]}
            integrationId={integration.id}
            onChanged={() => load({ refresh: true })}
          />
        )}
      </div>

      {showNewProject && (
        <ProjectFormDialog
          integrationId={integration.id}
          onClose={() => setShowNewProject(false)}
          onSaved={() => { setShowNewProject(false); load({ refresh: true }) }}
        />
      )}

      {logsProject && (
        <DeploymentLogsPanel
          integrationId={integration.id}
          deploymentId={logsProject.latest_deployment_id}
          projectName={logsProject.name}
          onClose={() => setLogsProject(null)}
        />
      )}

    </div>
  )
}
