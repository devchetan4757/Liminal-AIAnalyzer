import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { getRenderOwners, createRenderService } from '../../api/client'

const SERVICE_TYPES = [
  { value: 'web_service', label: 'Web Service' },
  { value: 'static_site', label: 'Static Site' },
  { value: 'background_worker', label: 'Background Worker' },
  { value: 'private_service', label: 'Private Service' },
  { value: 'cron_job', label: 'Cron Job' },
]

const RUNTIMES = ['node', 'python', 'ruby', 'go', 'rust', 'elixir', 'docker', 'image']

const REGIONS = [
  { value: 'oregon', label: 'Oregon (US West)' },
  { value: 'ohio', label: 'Ohio (US East)' },
  { value: 'virginia', label: 'Virginia (US East)' },
  { value: 'frankfurt', label: 'Frankfurt (EU)' },
  { value: 'singapore', label: 'Singapore (Asia)' },
]

const PLANS = ['free', 'starter', 'standard', 'pro', 'pro_plus', 'pro_max', 'pro_ultra']

const EMPTY_FORM = {
  name: '',
  type: 'web_service',
  owner_id: '',
  repo: '',
  branch: '',
  root_dir: '',
  auto_deploy: true,
  runtime: 'node',
  build_command: '',
  start_command: '',
  publish_path: './dist',
  image_url: '',
  dockerfile_path: './Dockerfile',
  docker_context: '.',
  region: 'oregon',
  plan: 'starter',
  num_instances: 1,
  schedule: '',
  pull_request_previews: false,
  advanced_config_text: '',
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-dim">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'h-9 rounded-md border border-border bg-bg-inset px-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent'

/**
 * Create form for a new Render service. Unlike RemoteActionButton
 * (one-click, registry-driven, always a confirm dialog), this is a
 * plain multi-field settings form - creating a service is a config
 * operation with many required fields (repo, runtime, plan, region...),
 * not a one-click remote action, so it gets its own dedicated dialog +
 * route (app/routers/render.py) instead of going through
 * /api/remote-actions. Same split as UptimeRobot's MonitorFormDialog.
 */
export function ServiceFormDialog({ integrationId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [owners, setOwners] = useState([])
  const [loadingOwners, setLoadingOwners] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getRenderOwners(integrationId)
      .then((list) => {
        if (cancelled) return
        setOwners(list)
        if (list.length === 1) {
          setForm((f) => ({ ...f, owner_id: list[0].id }))
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoadingOwners(false) })
    return () => { cancelled = true }
  }, [integrationId])

  const set = (key) => (e) => {
    const el = e?.target
    const value = el ? (el.type === 'checkbox' ? el.checked : el.value) : e
    setForm((f) => ({ ...f, [key]: value }))
  }

  const isStatic = form.type === 'static_site'
  const isCron = form.type === 'cron_job'
  const isDocker = form.runtime === 'docker'
  const isImage = form.runtime === 'image'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    let advanced_config
    if (form.advanced_config_text.trim()) {
      try {
        advanced_config = JSON.parse(form.advanced_config_text)
      } catch {
        setError('Advanced config must be valid JSON.')
        setBusy(false)
        return
      }
    }

    const payload = {
      name: form.name,
      type: form.type,
      owner_id: form.owner_id,
      repo: isImage ? null : form.repo,
      branch: form.branch || null,
      root_dir: form.root_dir || null,
      auto_deploy: form.auto_deploy,
      runtime: isStatic ? null : form.runtime,
      build_command: form.build_command || null,
      start_command: !isStatic && !isDocker && !isImage ? form.start_command : null,
      publish_path: isStatic ? form.publish_path : null,
      image_url: isImage ? form.image_url : null,
      dockerfile_path: isDocker ? form.dockerfile_path : null,
      docker_context: isDocker ? form.docker_context : null,
      region: form.region,
      plan: isStatic ? null : form.plan,
      num_instances: isStatic ? null : Number(form.num_instances) || 1,
      schedule: isCron ? form.schedule : null,
      pull_request_previews: !isStatic ? form.pull_request_previews : null,
      advanced_config,
    }

    try {
      await createRenderService(integrationId, payload)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-bg-raised p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">New service</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X size={16} />
          </button>
        </div>

        {loadingOwners ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-bg-inset" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input className={inputClass} value={form.name} onChange={set('name')} required />
              </Field>
              <Field label="Type">
                <select className={inputClass} value={form.type} onChange={set('type')}>
                  {SERVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Workspace / owner">
              <select className={inputClass} value={form.owner_id} onChange={set('owner_id')} required>
                <option value="" disabled>Select an owner…</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name || o.email}</option>
                ))}
              </select>
            </Field>

            {!isImage && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Repo URL">
                  <input
                    className={inputClass}
                    value={form.repo}
                    onChange={set('repo')}
                    placeholder="https://github.com/org/repo"
                    required
                  />
                </Field>
                <Field label="Branch">
                  <input className={inputClass} value={form.branch} onChange={set('branch')} placeholder="main" />
                </Field>
              </div>
            )}

            {!isStatic && (
              <Field label="Runtime">
                <select className={inputClass} value={form.runtime} onChange={set('runtime')}>
                  {RUNTIMES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            )}

            {isImage && (
              <Field label="Image URL">
                <input
                  className={inputClass}
                  value={form.image_url}
                  onChange={set('image_url')}
                  placeholder="docker.io/org/image:tag"
                  required
                />
              </Field>
            )}

            {isDocker && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dockerfile path">
                  <input className={inputClass} value={form.dockerfile_path} onChange={set('dockerfile_path')} />
                </Field>
                <Field label="Docker context">
                  <input className={inputClass} value={form.docker_context} onChange={set('docker_context')} />
                </Field>
              </div>
            )}

            {!isDocker && !isImage && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Build command">
                  <input className={inputClass} value={form.build_command} onChange={set('build_command')} />
                </Field>
                {isStatic ? (
                  <Field label="Publish path">
                    <input className={inputClass} value={form.publish_path} onChange={set('publish_path')} />
                  </Field>
                ) : (
                  <Field label="Start command">
                    <input className={inputClass} value={form.start_command} onChange={set('start_command')} />
                  </Field>
                )}
              </div>
            )}

            {isCron && (
              <Field label="Schedule (cron expression)">
                <input className={inputClass} value={form.schedule} onChange={set('schedule')} placeholder="0 */6 * * *" required />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Region">
                <select className={inputClass} value={form.region} onChange={set('region')}>
                  {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              {!isStatic && (
                <Field label="Plan">
                  <select className={inputClass} value={form.plan} onChange={set('plan')}>
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}
            </div>

            {!isStatic && !isCron && (
              <Field label="Instances">
                <input
                  type="number"
                  min="1"
                  max="100"
                  className={inputClass}
                  value={form.num_instances}
                  onChange={set('num_instances')}
                />
              </Field>
            )}

            <div className="flex flex-wrap gap-4 text-xs text-text-dim">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.auto_deploy} onChange={set('auto_deploy')} />
                Auto-deploy on push
              </label>
              {!isStatic && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.pull_request_previews} onChange={set('pull_request_previews')} />
                  Enable PR previews
                </label>
              )}
            </div>

            <Field label="Root directory (optional)">
              <input className={inputClass} value={form.root_dir} onChange={set('root_dir')} placeholder="." />
            </Field>

            <Field label="Advanced config (JSON, optional)">
              <textarea
                className={`${inputClass} h-20 py-2 font-mono text-xs`}
                value={form.advanced_config_text}
                onChange={set('advanced_config_text')}
                placeholder='{ "envVars": [...] }'
              />
            </Field>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !form.owner_id}>
                {busy ? 'Creating…' : 'Create service'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
