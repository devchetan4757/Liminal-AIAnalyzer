import { useEffect, useState } from 'react'
import {
  RefreshCw,
  Rocket,
  Globe,
  Cloud,
  Activity,
  Plus
} from 'lucide-react'

import { getVercelStatus } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

import {
  ProjectList,
  DeploymentList
} from '../components/vercel/ProjectTabs'

import { ProjectFormDialog } from '../components/vercel/ProjectFormDialog'

const TABS = [
  {
    key: 'projects',
    label: 'Projects',
    statKey: 'total_projects',
  },
  {
    key: 'deployments',
    label: 'Deployments',
    statKey: 'deployment_count',
  },
  {
    key: 'domains',
    label: 'Domains',
    statKey: 'domain_count',
  },
  {
    key: 'failed_deployments',
    label: 'Failed',
    statKey: 'failed_count',
  },
]

const EMPTY_MESSAGE = {
  projects: 'No Vercel projects found.',
  deployments: 'No deployments.',
  domains: 'No custom domains.',
  failed_deployments: 'No failed deployments.',
}

function StatCard({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
}) {

  const colours = {
    neutral: 'text-text-dim',
    warning: 'text-warning',
    success: 'text-success',
    danger: 'text-danger',
  }

  return (
    <Card className="flex flex-col gap-1 min-w-[120px]">
      <div
        className={`flex items-center gap-1.5 text-xs font-medium ${colours[tone]}`}
      >
        <Icon size={14} />
        {label}
      </div>

      <div className="font-mono text-2xl font-bold text-text">
        {value}
      </div>
    </Card>
  )
}

export default function VercelDashboard({
  integration,
}) {

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('projects')
  const [showNewProject, setShowNewProject] = useState(false)

  const load = async (opts) => {
    setLoading(true)
    setError('')

    try {
      const result = await getVercelStatus(
        integration.id,
        opts,
      )

      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [integration.id])

  if (loading)
    return (
      <div className="flex h-full flex-col gap-4 p-6">

        <div className="flex gap-3">
          {[1,2,3,4].map(i=>(
            <div
              key={i}
              className="h-20 w-32 animate-pulse rounded-lg bg-bg-inset"
            />
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {[1,2,3].map(i=>(
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-bg-inset"
            />
          ))}
        </div>

      </div>
    )

  if (error)
    return (
      <div className="p-6">

        <Card className="border-danger/40 bg-danger-soft/20">

          <p className="mb-1 text-sm font-medium text-danger">
            Status fetch failed
          </p>

          <p className="text-sm text-text-dim">
            {error}
          </p>

          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => load()}
          >
            Retry
          </Button>

        </Card>

      </div>
    )

  const s = data.stats
  return (
    <div className="flex h-full flex-col overflow-y-auto">

      {/* Header */}

      <div className="flex flex-col gap-4 border-b border-border px-6 py-4 lg:flex-row lg:items-center lg:justify-between">

        <div className="flex min-w-0 items-center gap-3">

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-inset">
            <Rocket
              size={18}
              className="text-accent"
            />
          </div>

          <div className="min-w-0">

            <div className="truncate text-sm font-semibold text-text">
              {integration.display_name}
            </div>

            <div className="truncate text-[11px] text-text-faint">

              Vercel · Projects & Deployments

              {data._cache && (
                <span>
                  {' '}·{' '}
                  {data._cache.hit
                    ? `cached ${Math.round(
                        data._cache.age_seconds / 60,
                      )}m ago`
                    : 'just refreshed'}
                </span>
              )}

            </div>

          </div>

        </div>

        <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">

          <Button
            variant="primary"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setShowNewProject(true)}
          >
            <Plus size={14} />
            New Project
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={loading}
            onClick={() => load({ refresh: true })}
          >
            <RefreshCw
              size={14}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </Button>

        </div>

      </div>

      {/* Stats */}

      <div className="grid grid-cols-1 gap-3 border-b border-border px-6 py-4 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard
          label="Projects"
          value={s.total_projects}
          tone="neutral"
          icon={Rocket}
        />

        <StatCard
          label="Deployments"
          value={s.deployment_count}
          tone="neutral"
          icon={Cloud}
        />

        <StatCard
          label="Domains"
          value={s.domain_count}
          tone="success"
          icon={Globe}
        />

        <StatCard
          label="Failed"
          value={s.failed_count}
          tone={s.failed_count ? 'danger' : 'success'}
          icon={Activity}
        />

      </div>

      {/* Tabs */}

      <div className="flex overflow-x-auto border-b border-border px-2 sm:px-6">

        {TABS.map((t) => {

          const count = t.statKey
            ? data.stats[t.statKey]
            : null

          return (

            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-faint hover:text-text'
              }`}
            >

              {t.label}

              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    tab === t.key
                      ? 'bg-accent-soft text-accent'
                      : 'bg-bg-inset text-text-dim'
                  }`}
                >
                  {count}
                </span>
              )}

            </button>

          )

        })}

      </div>

      {/* Content */}

      <div className="flex-1 overflow-y-auto px-6 py-4">

        {tab === 'projects' ? (

          <ProjectList
            items={data.projects}
            emptyMessage={EMPTY_MESSAGE.projects}
            integrationId={integration.id}
            onChanged={() => load({ refresh: true })}
          />

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
          onSaved={() => {
            setShowNewProject(false)
            load({ refresh: true })
          }}
        />

      )}

    </div>
  )
}
