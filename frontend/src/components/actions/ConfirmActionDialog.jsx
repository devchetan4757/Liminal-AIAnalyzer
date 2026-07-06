import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

const RISK_TONE = { low: 'success', medium: 'warning', high: 'danger' }

// Every manual/Watchlist remote action goes through this - no exceptions.
// Auto-triggered actions (not implemented yet - see REMOTE_ACTIONS_PLAN.md
// section 3) would never pass through this component at all.
//
// `fields` is optional: [{ key, label, type: 'text'|'number', placeholder, min, max }].
// Used for actions the registry marks as `requires` something the caller
// can't compute on its own (e.g. render/scale needs num_instances,
// render/run_job needs start_command). Actions like rollback resolve
// their required deploy_id themselves and never pass fields here.
export function ConfirmActionDialog({ label, consequence, riskTier, resourceName, fields, busy, error, onConfirm, onCancel }) {
  const [values, setValues] = useState({})

  const missingRequired = (fields || []).some((f) => !String(values[f.key] ?? '').trim())

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

        {fields?.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-text-dim">
                {f.label}
                <input
                  type={f.type || 'text'}
                  min={f.min}
                  max={f.max}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="rounded border border-border bg-bg-inset px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
            ))}
          </div>
        )}

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={riskTier === 'high' ? 'danger' : 'primary'}
            size="sm"
            onClick={() => onConfirm(values)}
            disabled={busy || missingRequired}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
