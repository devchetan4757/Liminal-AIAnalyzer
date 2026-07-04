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

  if (state === 'added') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-accent ${className}`}>
        <Eye size={12} />
        Watching
      </span>
    )
  }

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
      disabled={state === 'loading'}
      title="Add to Watchlist"
      className={`inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-dim transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50 ${className}`}
    >
      {state === 'loading' ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state === 'error' ? (
        <EyeOff size={12} />
      ) : (
        <Eye size={12} />
      )}
      {state === 'error' ? 'Retry' : 'Add to Watchlist'}
    </button>
  )
}
