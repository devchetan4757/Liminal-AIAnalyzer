import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { EnvVarsField, EMPTY_ENV_ROW, cleanEnvVars } from '../common/EnvVarsField'
import { createVercelProject } from '../../api/client'

const REPO_PROVIDERS = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'bitbucket', label: 'Bitbucket' },
]

const EMPTY_FORM = {
  name: '',
  repo: '',
  repo_provider: 'github',
  framework: '',
  root_directory: '',
  build_command: '',
  install_command: '',
  output_directory: '',
  env_vars: [EMPTY_ENV_ROW],
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
 * Create form for a new Vercel project. Same convention as Netlify's
 * SiteFormDialog and Render's ServiceFormDialog: a dedicated
 * settings-form dialog + route (app/routers/vercel.py), not a one-click
 * /api/remote-actions entry, since project creation needs several
 * optional-but-related fields up front (repo, framework, build config...).
 *
 * No team/account picker here - unlike Netlify, a Vercel integration is
 * already scoped to a single team or personal account at connect time
 * (see VercelAuthService / the team_id stored on the integration), so
 * there's nothing to choose between.
 *
 * Env vars are supported here even though the rest of the Vercel
 * integration deliberately avoids touching secret values (see the NOTE
 * at the top of VercelSyncService) - this is a scoped, explicit
 * exception for values the user provides at creation time only.
 */
export function ProjectFormDialog({ integrationId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    const payload = {
      name: form.name,
      repo: form.repo || null,
      repo_provider: form.repo_provider,
      framework: form.framework || null,
      root_directory: form.root_directory || null,
      build_command: form.build_command || null,
      install_command: form.install_command || null,
      output_directory: form.output_directory || null,
      env_vars: cleanEnvVars(form.env_vars),
    }

    try {
      const result = await createVercelProject(integrationId, payload)
      onSaved?.(result)
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
          <h2 className="text-sm font-semibold text-text">New project</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={set('name')}
              placeholder="my-project"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Repo provider">
              <select className={inputClass} value={form.repo_provider} onChange={set('repo_provider')}>
                {REPO_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Framework (optional)">
              <input className={inputClass} value={form.framework} onChange={set('framework')} placeholder="nextjs" />
            </Field>
          </div>

          <Field label="Repo (optional)">
            <input
              className={inputClass}
              value={form.repo}
              onChange={set('repo')}
              placeholder="org/repo"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Build command">
              <input className={inputClass} value={form.build_command} onChange={set('build_command')} placeholder="npm run build" />
            </Field>
            <Field label="Install command">
              <input className={inputClass} value={form.install_command} onChange={set('install_command')} placeholder="npm install" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Root directory">
              <input className={inputClass} value={form.root_directory} onChange={set('root_directory')} placeholder="." />
            </Field>
            <Field label="Output directory">
              <input className={inputClass} value={form.output_directory} onChange={set('output_directory')} placeholder="dist" />
            </Field>
          </div>

          <EnvVarsField
            rows={form.env_vars}
            onChange={(rows) => setForm((f) => ({ ...f, env_vars: rows }))}
          />

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !form.name}>
              {busy ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
