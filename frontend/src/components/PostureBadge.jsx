import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { getPosture } from '../api/client'
import { Badge } from './ui/Badge'

// Score -> Badge tone. Kept as a plain function (not a lookup object)
// since it's a range check, not a fixed set of keys.
function toneForScore(score) {
  if (score >= 85) return 'success'
  if (score >= 60) return 'warning'
  return 'danger'
}

// Small pill meant to sit inside IntegrationRow (ConnectedApps.jsx),
// next to the existing connected/disconnected status line. Fetches its
// own data so it doesn't require ConnectedApps to know about posture at
// all -- just drop <PostureBadge integration={integration} /> in.
//
// Renders nothing if there's no score yet (integration has never been
// scanned) rather than showing a misleading "0" or a loading spinner
// in a list of many rows.
export function PostureBadge({ integration }) {
  const [score, setScore] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPosture(integration.id)
      .then(data => {
        if (!cancelled) setScore(data.score)
      })
      .catch(() => {
        // Silently skip in list context -- errors surface properly
        // once the user opens the full PostureSection instead.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [integration.id])

  if (!loaded || score === null || score === undefined) return null

  return (
    <Badge tone={toneForScore(score)} title="Security posture score">
      <ShieldCheck size={11} />
      {score}
    </Badge>
  )
}
