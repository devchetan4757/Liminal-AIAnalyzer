import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { getActionRegistry, triggerRemoteAction } from '../../api/client'
import { ConfirmActionDialog } from './ConfirmActionDialog'

// Registry rarely changes within a session - cache it per provider so
// every button instance on a page doesn't re-fetch it.
const registryCache = {}

function useActionMeta(provider, action) {
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!registryCache[provider]) {
        registryCache[provider] = getActionRegistry(provider)
      }
      try {
        const list = await registryCache[provider]
        if (!cancelled) {
          setMeta(list.find((a) => a.action === action) || null)
        }
      } catch {
        // Registry fetch failing just means the button won't render -
        // it never falls back to firing the action blind.
      }
    }

    load()
    return () => { cancelled = true }
  }, [provider, action])

  return meta
}

/**
 * Generic remote-action trigger. Config (label/consequence/risk tier)
 * comes from the backend registry - never hardcoded per call site - so
 * the same component works for every provider/action combo.
 *
 * Always opens ConfirmActionDialog first. This component is only ever
 * used for manual or Watchlist-initiated actions.
 */
export function RemoteActionButton({
  integrationId,
  provider,
  action,
  resourceId,
  resourceName,
  extra = {},
  fields,
  triggeredBy = 'manual',
  incidentId,
  variant = 'secondary',
  size = 'iconXs',
  icon: Icon,
  onDone,
  disabled,
}) {
  const meta = useActionMeta(provider, action)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!meta) return null // action not in registry (or not loaded yet) - render nothing

  const handleConfirm = async (fieldValues = {}) => {
    setBusy(true)
    setError('')
    try {
      const row = await triggerRemoteAction({
        integration_id: integrationId,
        provider,
        action,
        resource_id: resourceId,
        resource_name: resourceName,
        triggered_by: triggeredBy,
        incident_id: incidentId,
        extra: { ...extra, ...fieldValues },
      })
      if (row.status === 'failed') {
        setError(row.result?.error || 'Action failed.')
        return
      }
      setOpen(false)
      onDone?.(row)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Button
  variant={variant}
  size={size}
  disabled={disabled}
  onClick={() => setOpen(true)}
  title={meta.label}
>
  {Icon && <Icon className="size-4" />}
</Button>


      {open && (
        <ConfirmActionDialog
          label={meta.label}
          consequence={meta.consequence}
          riskTier={meta.risk_tier}
          resourceName={resourceName}
          fields={fields}
          busy={busy}
          error={error}
          onCancel={() => { setOpen(false); setError('') }}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}
