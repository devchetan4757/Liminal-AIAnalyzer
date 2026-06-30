import { UploadCloud } from 'lucide-react'

export default function UploadPrompt({ onConfirm }) {
  return (
    <button
      onClick={onConfirm}
      className="mt-2 flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
    >
      <UploadCloud size={14} />
      Upload full file for a fresh scan
    </button>
  )
}
