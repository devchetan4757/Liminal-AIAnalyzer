import { AlertTriangle, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

const RISK_TONE = { low: 'success', medium: 'warning', high: 'danger' }

// Every manual/Watchlist remote action goes through this - no exceptions.
// Auto-triggered actions (not implemented yet - see REMOTE_ACTIONS_PLAN.md
// section 3) would never pass through this component at all.
export function ConfirmActionDialog({ label, consequence, riskTier, resourceName, busy, error, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg-raised p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" />
            <h2 className="text-sm font-semibold text-text">{label}?</h2>
          </div>
          <button onClick={onCancel} className="text-text-faint hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <Badge tone={RISK_TONE[riskTier] || 'neutral'}>{riskTier} risk</Badge>
          <span className="truncate text-sm font-medium text-text">{resourceName}</span>
        </div>

        {consequence && (
          <p className="mb-4 text-xs text-text-dim">{consequence}</p>
        )}

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={riskTier === 'high' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
