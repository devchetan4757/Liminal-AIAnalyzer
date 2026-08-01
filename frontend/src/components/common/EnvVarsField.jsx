import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'

export const EMPTY_ENV_ROW = { key: '', value: '' }

const inputClass =
  'h-9 rounded-md border border-border bg-bg-inset px-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent'

/** Parses "KEY=value" lines (`.env` style) into rows. */
function parseEnvLines(text) {
  const rows = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) rows.push({ key, value })
  }
  return rows
}

/**
 * Parses env vars from either format:
 *  - `.env` style: one KEY=value per line
 *  - JSON: either { "KEY": "value", ... } or [{ "key": "K", "value": "V" }, ...]
 * Format is auto-detected from the content, so file upload and paste both
 * accept whichever the user has on hand.
 */
export function parseEnvInput(text) {
  const trimmed = text.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
          .map((r) => ({ key: String(r.key ?? r.name ?? '').trim(), value: String(r.value ?? '') }))
          .filter((r) => r.key)
      }
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([key, value]) => ({ key: key.trim(), value: value == null ? '' : String(value) }))
          .filter((r) => r.key)
      }
    } catch {
      // Not valid JSON - fall through and try line-based parsing instead.
    }
  }

  return parseEnvLines(trimmed)
}

/**
 * Trims/filters form rows down to the {key, value} pairs worth sending -
 * call this at submit time in whichever create-service/site form embeds
 * this field, right before building the request payload.
 */
export function cleanEnvVars(rows) {
  return rows.map((r) => ({ key: r.key.trim(), value: r.value })).filter((r) => r.key)
}

/**
 * Key/value environment variable editor, shared across every hosting
 * integration's create-service/site form (Render, Netlify, ...). The
 * actual validation (key format, value length, count limits) happens
 * server-side (app/core/env_vars.py) - this only shapes input from three
 * sources: typing rows by hand, pasting `.env`-style text or JSON, or
 * uploading a `.env`/`.json` file directly.
 */
export function EnvVarsField({ rows, onChange }) {
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const updateRow = (i, key, value) => {
    onChange(rows.map((r, idx) => (idx === i ? { key, value } : r)))
  }
  const addRow = () => onChange([...rows, { key: '', value: '' }])
  const removeRow = (i) => {
    const next = rows.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [{ key: '', value: '' }])
  }

  const mergeParsed = (parsed) => {
    if (!parsed.length) {
      setError('No KEY=value pairs or JSON entries found.')
      setStatus('')
      return
    }
    const existing = rows.filter((r) => r.key.trim())
    const merged = [...existing]
    for (const row of parsed) {
      const idx = merged.findIndex((r) => r.key === row.key)
      if (idx >= 0) merged[idx] = row
      else merged.push(row)
    }
    onChange(merged)
    setError('')
    setStatus(`Added ${parsed.length} variable${parsed.length === 1 ? '' : 's'}.`)
  }

  const applyPaste = () => {
    try {
      mergeParsed(parseEnvInput(pasteText))
      setPasteText('')
      setPasteOpen(false)
    } catch {
      setError('Could not parse that input as .env or JSON.')
    }
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-uploading the same filename
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        mergeParsed(parseEnvInput(String(reader.result || '')))
      } catch {
        setError('Could not parse that file as .env or JSON.')
      }
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-dim">Environment variables</span>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer text-xs text-accent hover:underline">
            Upload file
            <input
              type="file"
              accept=".env,.txt,.json,text/plain,application/json"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPasteOpen((v) => !v)
              setError('')
            }}
            className="text-xs text-accent hover:underline"
          >
            {pasteOpen ? 'Close paste box' : 'Paste .env or JSON'}
          </button>
        </div>
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg-inset p-2">
          <textarea
            className={`${inputClass} h-24 py-2 font-mono text-xs`}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=sk-...\n\nor\n\n{ "DATABASE_URL": "postgres://...", "API_KEY": "sk-..." }'}
          />
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={applyPaste}>
              Add parsed vars
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && status && <p className="text-xs text-text-faint">{status}</p>}

      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              className={`${inputClass} flex-1 font-mono`}
              value={row.key}
              onChange={(e) => updateRow(i, e.target.value, row.value)}
              placeholder="KEY"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <input
              className={`${inputClass} flex-1 font-mono`}
              value={row.value}
              onChange={(e) => updateRow(i, row.key, e.target.value)}
              placeholder="value"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="shrink-0 rounded-md p-1.5 text-text-faint hover:bg-bg-inset hover:text-danger"
              aria-label="Remove variable"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex w-fit items-center gap-1 text-xs text-text-dim hover:text-text"
      >
        <Plus size={12} /> Add variable
      </button>
    </div>
  )
}
