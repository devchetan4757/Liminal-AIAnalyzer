import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { addToWatchlist } from '../../api/client'

/**
 * Small reusable button dropped into any dashboard's failing-item card.
 * Calls POST /api/watchlist, then flips to a disabled "Watching" state.
 * The backend dedupes on (integration_id, external_id), so re-clicking
 * (or re-rendering after a refresh) never creates duplicate entries.
 */
export function AddToWatchlistButton({
  integrationId,
  provider,
  resourceType,
  externalId,
  resourceName,
  title,
  severity = 'medium',
  raw,
  className = '',
}) {
  const [state, setState] = useState('idle') // idle | loading | added | error

  const handleClick = async (e) => {
    e.stopPropagation()
    e.preventDefault()
    setState('loading')

    try {
      await addToWatchlist({
        integration_id: integrationId,
        provider,
        resource_type: resourceType,
        external_id: externalId,
        resource_name: resourceName,
        title,
        severity,
        raw: raw || {},
      })

      setState('added')
    } catch (err) {
      console.error('Failed to add to watchlist:', err)
      setState('error')
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'added'}
      title={
        state === 'added'
          ? 'Watching'
          : state === 'error'
            ? 'Retry adding to Watchlist'
            : 'Add to Watchlist'
      }
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-60 ${
        state === 'added'
          ? 'border-accent/50 bg-bg-raised text-accent'
          : 'border-border bg-bg-raised text-text-dim hover:border-accent/50 hover:text-accent'
      } ${className}`}
    >
      {state === 'loading' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : state === 'error' ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
    </button>
  )
}
