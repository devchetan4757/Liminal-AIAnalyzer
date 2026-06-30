import { UploadCloud } from 'lucide-react'

export default function UploadPrompt({ onConfirm }) {
  return (
    <button className="upload-prompt" onClick={onConfirm}>
      <UploadCloud size={15} />
      Upload full file for a fresh scan
    </button>
  )
}
