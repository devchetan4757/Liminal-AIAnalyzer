import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Database,
  FileSearch,
  CircleCheck,
  Lightbulb,
  Copy,
  Download,
  Check,
} from 'lucide-react'
import { Card, CardHeader } from './ui/Card'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import VerdictBadge from './VerdictBadge'

export default function AnalysisCard({ data }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const {
    indicator,
    indicator_type,
    verdict,
    score,
    headline,
    findings,
    recommendation,
    sources,
    raw,
  } = data

  const handleCopy = () => {
    navigator.clipboard.writeText(indicator)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify({ indicator, indicator_type, verdict, score, headline, findings, recommendation, sources, raw }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `liminal-${indicator_type}-${indicator.slice(0, 16)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="w-full max-w-md rounded-lg border-0">
      <CardHeader>
        <VerdictBadge verdict={verdict} />
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-text-faint">Confidence</div>
          <div className="font-mono text-sm font-semibold text-text">{score}</div>
        </div>
      </CardHeader>

      <Section icon={<FileSearch size={15} />} label="Indicator">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="accent">{indicator_type}</Badge>
          <div className="flex min-w-0 items-center gap-2">
            <code className="truncate font-mono text-xs text-text-dim">{indicator}</code>
            <button
              onClick={handleCopy}
              className="shrink-0 text-text-faint hover:text-accent"
              title="Copy"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </Section>

      {headline && (
        <Section>
          <p className="text-sm text-text">{headline}</p>
        </Section>
      )}

      {findings?.length > 0 && (
        <Section icon={<CircleCheck size={15} />} label="Findings">
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-dim">
            {findings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        </Section>
      )}

      {recommendation && (
        <Section>
          <div className="flex gap-2 rounded-md bg-warning-soft p-2.5 text-sm text-warning">
            <Lightbulb size={15} className="mt-0.5 shrink-0" />
            <p>{recommendation}</p>
          </div>
        </Section>
      )}

      <Section label="Sources">
        <div className="flex flex-wrap gap-1.5">
          {sources?.length ? (
            sources.map((source) => (
              <Badge key={source} tone="neutral">{source}</Badge>
            ))
          ) : (
            <Badge tone="neutral">Unknown</Badge>
          )}
        </div>
      </Section>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={handleExport} className="flex-1">
          <Download size={14} />
          Export JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowRaw((s) => !s)} className="flex-1">
          <Database size={14} />
          {showRaw ? 'Hide Raw' : 'View Raw'}
          {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Button>
      </div>

      {showRaw && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-bg-inset p-3 font-mono text-xs text-text-dim">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </Card>
  )
}

function Section({ icon, label, children }) {
  return (
    <div className="mt-3 first:mt-0">
      {label && (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-faint">
          {icon}
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
