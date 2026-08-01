import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { EnvVarsField, EMPTY_ENV_ROW, cleanEnvVars } from '../common/EnvVarsField'
import { getNetlifyAccounts, createNetlifySite } from '../../api/client'

const REPO_PROVIDERS = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'bitbucket', label: 'Bitbucket' },
]

const EMPTY_FORM = {
  name: '',
  repo: '',
  repo_provider: 'github',
  branch: 'main',
  build_command: '',
  publish_dir: '',
  account_slug: '',
  account_id: '',
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
 * Create form for a new Netlify site. Same convention as Render's
 * ServiceFormDialog: a dedicated settings-form dialog + route
 * (app/routers/netlify.py), not a one-click /api/remote-actions entry,
 * since site creation needs several required fields up front (repo,
 * account, branch...).
 *
 * Env vars are supported here even though the rest of the Netlify
 * integration deliberately avoids touching secret values (see the NOTE
 * at the top of NetlifySyncService) - this is a scoped, explicit
 * exception for values the user provides at creation time only.
 */
export function SiteFormDialog({ integrationId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [accounts, setAccounts] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getNetlifyAccounts(integrationId)
      .then((list) => {
        if (cancelled) return
        setAccounts(list)
        if (list.length === 1) {
          setForm((f) => ({ ...f, account_slug: list[0].slug, account_id: list[0].id }))
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoadingAccounts(false) })
    return () => { cancelled = true }
  }, [integrationId])

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleAccountChange = (e) => {
    const slug = e.target.value
    const account = accounts.find((a) => a.slug === slug)
    setForm((f) => ({ ...f, account_slug: slug, account_id: account?.id || '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    const payload = {
      name: form.name || null,
      repo: form.repo,
      repo_provider: form.repo_provider,
      branch: form.branch || null,
      build_command: form.build_command || null,
      publish_dir: form.publish_dir || null,
      account_slug: form.account_slug || null,
      account_id: form.account_id || null,
      env_vars: cleanEnvVars(form.env_vars),
    }

    try {
      const result = await createNetlifySite(integrationId, payload)
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
          <h2 className="text-sm font-semibold text-text">New site</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X size={16} />
          </button>
        </div>

        {loadingAccounts ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-bg-inset" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Name (optional)">
              <input
                className={inputClass}
                value={form.name}
                onChange={set('name')}
                placeholder="my-site (auto-generated if left blank)"
              />
            </Field>

            {accounts.length > 0 && (
              <Field label="Team / account">
                <select className={inputClass} value={form.account_slug} onChange={handleAccountChange}>
                  <option value="">Personal account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.slug}>{a.name || a.slug}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Repo provider">
                <select className={inputClass} value={form.repo_provider} onChange={set('repo_provider')}>
                  {REPO_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Branch">
                <input className={inputClass} value={form.branch} onChange={set('branch')} placeholder="main" />
              </Field>
            </div>

            <Field label="Repo">
              <input
                className={inputClass}
                value={form.repo}
                onChange={set('repo')}
                placeholder="org/repo"
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Build command">
                <input className={inputClass} value={form.build_command} onChange={set('build_command')} placeholder="npm run build" />
              </Field>
              <Field label="Publish directory">
                <input className={inputClass} value={form.publish_dir} onChange={set('publish_dir')} placeholder="dist" />
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
              <Button type="submit" size="sm" disabled={busy || !form.repo}>
                {busy ? 'Creating…' : 'Create site'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
