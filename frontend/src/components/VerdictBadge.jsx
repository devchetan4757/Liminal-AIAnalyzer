import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react'
import { Badge } from './ui/Badge'

const VERDICTS = {
  malicious:  { label: 'Malicious',  tone: 'danger',  Icon: ShieldX },
  suspicious: { label: 'Suspicious', tone: 'warning', Icon: ShieldAlert },
  clean:      { label: 'Clean',      tone: 'success', Icon: ShieldCheck },
  unknown:    { label: 'Unknown',    tone: 'neutral', Icon: ShieldQuestion },
}

export default function VerdictBadge({ verdict = 'unknown' }) {
  const v = VERDICTS[verdict] || VERDICTS.unknown

  return (
    <Badge tone={v.tone}>
      <v.Icon size={14} strokeWidth={2.2} />
      {v.label}
    </Badge>
  )
}
