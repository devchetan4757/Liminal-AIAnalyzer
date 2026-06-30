import { useState } from 'react'
import { Search, Hash, Link2, Globe, Network, MessageSquare } from 'lucide-react'
import { analyzeIndicator } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import AnalysisCard from '../components/AnalysisCard'

const TYPES = [
  { value: 'hash', label: 'Hash', icon: Hash, placeholder: 'e.g. 44d88612fea8a8f36de82e1278abb02f' },
  { value: 'url', label: 'URL', icon: Link2, placeholder: 'e.g. https://example.com/payload' },
  { value: 'ip', label: 'IP', icon: Network, placeholder: 'e.g. 8.8.8.8' },
  { value: 'domain', label: 'Domain', icon: Globe, placeholder: 'e.g. example.com' },
]

export default function ManualAnalysisPage({ onAskLiminal }) {
  const [type, setType] = useState('hash')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const activeType = TYPES.find((t) => t.value === type)

  const submit = async () => {
    const indicator = value.trim()
    if (!indicator || loading) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const data = await analyzeIndicator({ indicator_type: type, indicator })
      if (data.type === 'analysis') {
        setResult(data)
      } else {
        setError(data.content || 'No data found for this indicator.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text">Manual Analysis</h1>
        <p className="mt-1 text-sm text-text-dim">
          Run a direct multi-source lookup on a hash, URL, IP, or domain — no AI explanation required.
          Want plain-English help instead?{' '}
          <button onClick={onAskLiminal} className="inline-flex items-center gap-1 text-accent hover:underline">
            <MessageSquare size={13} />
            Ask Liminal
          </button>
        </p>
      </div>

      <Card className="mb-6 max-w-2xl">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                type === t.value
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border text-text-dim hover:border-accent/40'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeType.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          <Button onClick={submit} disabled={!value.trim() || loading} className="shrink-0">
            <Search size={16} />
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-danger">{error}</p>
        )}
      </Card>

      {result && (
        <AnalysisCard data={result} />
      )}

      {!result && !error && !loading && (
        <p className="max-w-md text-sm text-text-faint">
          Results come straight from VirusTotal, MalwareBazaar, URLhaus, ThreatFox,
          AbuseIPDB, and OTX — whichever sources support the indicator type you pick.
          Every lookup here is saved to your History automatically.
        </p>
      )}
    </div>
  )
}
