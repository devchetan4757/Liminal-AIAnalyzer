import { useEffect, useState } from 'react'
import { Plus, X, Github, Database, Cloud, Activity, Plug, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { getIntegrations, createIntegration, syncIntegration, deleteIntegration } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import GitHubDashboard from './GitHubDashboard'
import MongoDBDashboard from './MongoDBDashboard'
import RenderDashboard from './RenderDashboard'
import UptimeRobotDashboard from './UptimeRobotDashboard'
import NeonDashboard from './NeonDashboard'

const PROVIDER_ICON = {
  github:  Github,
  mongodb: Database,
  render:  Cloud,
  uptimerobot: Activity,
  neon: Database,
}

// Single source of truth for the connect modal: label, icon, auth type,
// and the exact credential fields each provider needs. Adding a new
// provider means adding one entry here — the grid, the header, the
// form, and the payload all derive from this list.
const PROVIDERS = [
  {
    key: 'github',
    label: 'GitHub',
    icon: Github,
    authType: 'token',
    namePlaceholder: 'e.g. My GitHub',
    fields: [
      {
        stateKey: 'token',
        credKey: 'token',
        label: 'Personal Access Token',
        placeholder: 'ghp_...',
        type: 'password',
      },
    ],
    note: (
      <>
        Needs scopes: <code className="font-mono">repo</code>,{' '}
        <code className="font-mono">read:user</code>,{' '}
        <code className="font-mono">security_events</code>
      </>
    ),
  },
  {
    key: 'render',
    label: 'Render',
    icon: Cloud,
    authType: 'api_key',
    namePlaceholder: 'e.g. Production Render',
    fields: [
      {
        stateKey: 'renderApiKey',
        credKey: 'api_key',
        label: 'API Key',
        placeholder: 'rnd_...',
        type: 'password',
      },
    ],
    note: 'From Render Dashboard → Account Settings → API Keys. Read-only use here — service and deploy status only, never env var values.',
  },
  {
    key: 'uptimerobot',
    label: 'UptimeRobot',
    icon: Activity,
    authType: 'api_key',
    namePlaceholder: 'e.g. Production Monitors',
    fields: [
      {
        stateKey: 'uptimeApiKey',
        credKey: 'api_key',
        label: 'API Key',
        placeholder: 'ur...',
        type: 'password',
      },
    ],
    note: (
      <>
        From UptimeRobot → My Settings → API Keys. Use the{' '}
        <span className="font-mono">Read-Only</span> key — this
        integration never creates, edits, or pauses monitors.
      </>
    ),
  },
  {
    key: 'neon',
    label: 'Neon',
    icon: Database,
    authType: 'api_key',
    namePlaceholder: 'e.g. Production Neon',
    fields: [
      {
        stateKey: 'neonApiKey',
        credKey: 'api_key',
        label: 'API Key',
        placeholder: 'napi_...',
        type: 'password',
      },
    ],
    note: 'From Neon Console → Account Settings → API Keys. Read-only use here — project, branch, and operation metadata only, never connection strings or role passwords.',
  },
  {
    key: 'mongodb',
    label: 'MongoDB Atlas',
    icon: Database,
    authType: 'api_key_pair',
    namePlaceholder: 'e.g. Production Atlas',
    fields: [
      {
        stateKey: 'publicKey',
        credKey: 'public_key',
        label: 'Public Key',
        placeholder: 'Atlas API public key',
        type: 'text',
      },
      {
        stateKey: 'privateKey',
        credKey: 'private_key',
        label: 'Private Key',
        placeholder: 'Atlas API private key',
        type: 'password',
      },
      {
        stateKey: 'groupId',
        credKey: 'group_id',
        label: 'Project (Group) ID',
        placeholder: 'e.g. 5f1b2c3d4e5f6a7b8c9d0e1f',
        type: 'text',
      },
    ],
    note: (
      <>
        Read-only project activity/events only — never cluster data.
        Requires <span className="font-mono">Project Read Only</span> access
        and the server's IP allow-listed in Atlas.
      </>
    ),
  },
]

function timeAgo(iso) {
  if (!iso) return 'Never synced'
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1)    return 'Just now'
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function ConnectModal({ onClose, onConnected }) {
  const [providerKey, setProviderKey] = useState(PROVIDERS[0].key)
  const [displayName, setDisplayName] = useState('')
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const provider = PROVIDERS.find(p => p.key === providerKey)

  const setField = (stateKey, value) => {
    setValues(prev => ({ ...prev, [stateKey]: value }))
  }

  const isValid =
    displayName.trim() &&
    provider.fields.every(f => (values[f.stateKey] || '').trim())

  const submit = async () => {
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      const credentials = Object.fromEntries(
        provider.fields.map(f => [f.credKey, (values[f.stateKey] || '').trim()])
      )

      await createIntegration({
        provider: provider.key,
        display_name: displayName.trim(),
        authentication_type: provider.authType,
        credentials,
      })
      onConnected()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose}
          className="absolute right-4 top-4 text-text-faint hover:text-text">
          <X size={16} />
        </button>

        <h2 className="mb-3 text-base font-semibold text-text">Connect an app</h2>

        {/* provider grid — wraps neatly instead of a cramped single-line row */}
        <div className="mb-5 grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => {
            const Icon = p.icon
            const active = p.key === providerKey
            return (
              <button
                key={p.key}
                onClick={() => setProviderKey(p.key)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border text-text-faint hover:border-accent/40 hover:text-text'
                }`}
              >
                <Icon size={18} />
                <span className="text-[11px] font-medium leading-tight">{p.label}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-4 flex items-center gap-2 border-t border-border pt-4">
          <provider.icon size={18} className="text-text" />
          <h3 className="text-sm font-semibold text-text">Connect {provider.label}</h3>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-dim">
              Display Name
            </label>
            <Input
              placeholder={provider.namePlaceholder}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>

          {provider.fields.map(f => (
            <div key={f.stateKey}>
              <label className="mb-1.5 block text-xs font-medium text-text-dim">
                {f.label}
              </label>
              <Input
                placeholder={f.placeholder}
                type={f.type}
                value={values[f.stateKey] || ''}
                onChange={e => setField(f.stateKey, e.target.value)}
              />
            </div>
          ))}

          {provider.note && (
            <p className="text-[11px] text-text-faint">{provider.note}</p>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!isValid || loading}
            onClick={submit}
          >
            {loading ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </Card>
    </div>
  )
}


function IntegrationRow({ integration, active, onSelect, onDelete, onSync }) {
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSync = async (e) => {
    e.stopPropagation()
    setSyncing(true)
    try { await onSync(integration.id) } finally { setSyncing(false) }
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm(`Disconnect ${integration.display_name}? This removes all synced data.`)) return
    setDeleting(true)
    try { await onDelete(integration.id) } finally { setDeleting(false) }
  }

  return (
    <button
      onClick={() => onSelect(integration)}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        active
          ? 'border-accent bg-accent-soft'
          : 'border-border bg-bg-raised hover:border-accent/40'
      }`}
    >
    <div className="flex items-center gap-2 mb-2">
        {(() => {
          const Icon = PROVIDER_ICON[integration.provider] || Plug
          return <Icon size={16} className={active ? 'text-accent' : 'text-text-dim'} />
        })()}
        <span className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-text'}`}>
          {integration.display_name}
        </span>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {integration.status === 'connected'
            ? <CheckCircle2 size={12} className="text-success" />
            : <AlertCircle  size={12} className="text-danger" />}
          <span className="text-[11px] text-text-faint capitalize">{integration.status}</span>
        </div>
        <span className="text-[11px] text-text-faint">{timeAgo(integration.last_sync)}</span>
      </div>

      <div className="mt-2 flex gap-1" onClick={e => e.stopPropagation()}>
        <button
          onClick={handleSync}
          disabled={syncing}
          title="Sync"
          className="rounded p-1 text-text-faint hover:bg-bg-inset hover:text-accent disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Disconnect"
          className="rounded p-1 text-text-faint hover:bg-bg-inset hover:text-danger disabled:opacity-40 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </button>
  )
}

export default function ConnectedApps() {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState(null)
  const [showModal, setShowModal]       = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getIntegrations()
      setIntegrations(data)
      // keep selected in sync if it was previously chosen
      if (selected) {
        const updated = data.find(i => i.id === selected.id)
        if (updated) setSelected(updated)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    await deleteIntegration(id)
    if (selected?.id === id) setSelected(null)
    load()
  }

  const handleSync = async (id) => {
    await syncIntegration(id)
    load()
  }

  return (
    <div className="flex h-full">

      {/* left panel */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-bg-raised">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Plug size={15} className="text-accent" />
            <span className="text-sm font-semibold text-text">Connected Apps</span>
          </div>
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            Connect
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex flex-col gap-2">
              {[1,2].map(i => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-bg-inset" />
              ))}
            </div>
          )}

          {!loading && integrations.length === 0 && (
            <div className="mt-8 px-2 text-center">
              <Github size={28} className="mx-auto mb-3 text-text-faint" />
              <p className="text-sm font-medium text-text">No apps connected</p>
              <p className="mt-1 text-xs text-text-faint">
                Connect GitHub, MongoDB Atlas, Render, UptimeRobot, or Neon to start monitoring for security issues.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {integrations.map(integration => (
              <IntegrationRow
                key={integration.id}
                integration={integration}
                active={selected?.id === integration.id}
                onSelect={setSelected}
                onDelete={handleDelete}
                onSync={handleSync}
              />
            ))}
          </div>
        </div>
      </div>

      {/* right panel */}
      <div className="flex-1 overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-inset">
              <Github size={26} className="text-text-faint" />
            </div>
            <p className="text-sm font-medium text-text">Select a connected app</p>
            <p className="max-w-xs text-xs text-text-faint">
              Choose an integration on the left to view its security dashboard — secret leaks,
              .env pushes, vulnerable dependencies, failed deploys, and more.
            </p>
          </div>
         ) : selected.provider === 'mongodb' ? (
          <MongoDBDashboard integration={selected} />
        ) : selected.provider === 'render' ? (
          <RenderDashboard integration={selected} />
        ) : selected.provider === 'uptimerobot' ? (
          <UptimeRobotDashboard integration={selected} />
        ) : selected.provider === 'neon' ? (
          <NeonDashboard integration={selected} />
        ) : (
          <GitHubDashboard integration={selected} />
        )}
        
      </div>

      {showModal && (
        <ConnectModal
          onClose={() => setShowModal(false)}
          onConnected={load}
        />
      )}
    </div>
  )
}
