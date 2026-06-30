import { useRef } from 'react'
import { Paperclip } from 'lucide-react'

export default function FileUpload({ onSelect }) {
  const inputRef = useRef(null)

  return (
    <>
      <button
        type="button"
        className="icon-button"
        title="Attach file"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={18} />
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onSelect(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
