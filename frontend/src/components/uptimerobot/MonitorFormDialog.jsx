import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  getUptimeRobotMonitor,
  createUptimeRobotMonitor,
  updateUptimeRobotMonitor,
} from '../../api/client'

const MONITOR_TYPES = ['HTTP', 'KEYWORD', 'PING', 'PORT', 'HEARTBEAT', 'DNS', 'API', 'UDP']

// Types where "url" is the host/target being checked. HEARTBEAT is the
// one exception - UptimeRobot generates the URL server-side, so there's
// nothing for the user to type.
const URL_LABEL = {
  PORT: 'Host',
  UDP: 'Host',
  PING: 'Host / IP',
}

const NEEDS_PORT = new Set(['PORT', 'UDP'])

const EMPTY_FORM = {
  friendly_name: '',
  type: 'HTTP',
  url: '',
  interval: 300,
  timeout: 30,
  port: '',
  keyword_type: 'exists',
  keyword_case_type: 'CaseInsensitive',
  keyword_value: '',
  advanced_config_text: '',
}

function toFormState(monitor) {
  return {
    friendly_name: monitor.friendly_name || '',
    type: monitor.type || 'HTTP',
    url: monitor.url || '',
    interval: monitor.interval ?? 300,
    timeout: monitor.timeout ?? 30,
    port: monitor.port ?? '',
    keyword_type: monitor.keyword_type || 'exists',
    keyword_case_type: monitor.keyword_case_type || 'CaseInsensitive',
    keyword_value: monitor.keyword_value || '',
    advanced_config_text: monitor.advanced_config
      ? JSON.stringify(monitor.advanced_config, null, 2)
      : '',
  }
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
 * Create / edit form for an UptimeRobot monitor. Unlike RemoteActionButton
 * (one-click, registry-driven, always a confirm dialog), this is a plain
 * multi-field settings form - create/edit aren't one-click remote actions,
 * they're config edits, so they get their own dedicated dialog + routes
 * (app/routers/uptimerobot.py) instead of going through /api/remote-actions.
 */
export function MonitorFormDialog({ integrationId, monitorId, onClose, onSaved }) {
  const isEdit = Boolean(monitorId)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(isEdit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    setLoading(true)
    getUptimeRobotMonitor(integrationId, monitorId)
      .then((data) => { if (!cancelled) setForm(toFormState(data)) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [integrationId, monitorId, isEdit])

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [key]: value }))
  }

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
      friendly_name: form.friendly_name,
      type: form.type,
      url: form.url || null,
      interval: Number(form.interval) || 300,
      timeout: Number(form.timeout) || 30,
      port: NEEDS_PORT.has(form.type) && form.port !== '' ? Number(form.port) : null,
      keyword_type: form.type === 'KEYWORD' ? form.keyword_type : null,
      keyword_case_type: form.type === 'KEYWORD' ? form.keyword_case_type : null,
      keyword_value: form.type === 'KEYWORD' ? form.keyword_value : null,
      advanced_config,
    }

    try {
      if (isEdit) {
        await updateUptimeRobotMonitor(integrationId, monitorId, payload)
      } else {
        await createUptimeRobotMonitor(integrationId, payload)
      }
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-raised p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">
            {isEdit ? 'Edit monitor' : 'Add monitor'}
          </h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-bg-inset" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Friendly name">
              <input
                className={inputClass}
                value={form.friendly_name}
                onChange={set('friendly_name')}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className={inputClass} value={form.type} onChange={set('type')}>
                  {MONITOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>

              {form.type !== 'HEARTBEAT' && (
                <Field label={URL_LABEL[form.type] || 'URL'}>
                  <input
                    className={inputClass}
                    value={form.url}
                    onChange={set('url')}
                    placeholder="https://example.com"
                    required
                  />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Interval (sec)">
                <input
                  type="number"
                  min="30"
                  className={inputClass}
                  value={form.interval}
                  onChange={set('interval')}
                />
              </Field>
              <Field label="Timeout (sec)">
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={form.timeout}
                  onChange={set('timeout')}
                />
              </Field>
              {NEEDS_PORT.has(form.type) && (
                <Field label="Port">
                  <input
                    type="number"
                    className={inputClass}
                    value={form.port}
                    onChange={set('port')}
                  />
                </Field>
              )}
            </div>

            {form.type === 'KEYWORD' && (
              <div className="grid grid-cols-3 gap-3 rounded-md border border-border p-3">
                <Field label="Alert when">
                  <select
                    className={inputClass}
                    value={form.keyword_type}
                    onChange={set('keyword_type')}
                  >
                    <option value="exists">Keyword exists</option>
                    <option value="not_exists">Keyword not exists</option>
                  </select>
                </Field>
                <Field label="Case">
                  <select
                    className={inputClass}
                    value={form.keyword_case_type}
                    onChange={set('keyword_case_type')}
                  >
                    <option value="CaseInsensitive">Case insensitive</option>
                    <option value="CaseSensitive">Case sensitive</option>
                  </select>
                </Field>
                <Field label="Keyword">
                  <input
                    className={inputClass}
                    value={form.keyword_value}
                    onChange={set('keyword_value')}
                  />
                </Field>
              </div>
            )}

            <Field label="Advanced config (JSON, optional)">
              <textarea
                className={`${inputClass} h-20 py-2 font-mono text-xs`}
                value={form.advanced_config_text}
                onChange={set('advanced_config_text')}
                placeholder='{ "assertions": [...] }'
              />
            </Field>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create monitor'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
