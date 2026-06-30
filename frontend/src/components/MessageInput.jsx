import { useRef, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import FileUpload from './FileUpload'
import { Input } from './ui/Input'
import { Button } from './ui/Button'

export default function MessageInput({ onSendText, onSendFile, disabled }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSendText(value)
    setText('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <footer className="border-t border-border bg-bg-raised p-3">
      <div className="flex items-center gap-2">
        <FileUpload onSelect={onSendFile} />

        <Input
          ref={inputRef}
          type="text"
          value={text}
          disabled={disabled}
          placeholder="Message AI Assistant..."
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <Button
          size="md"
          onClick={submit}
          disabled={disabled || !text.trim()}
          title="Send message"
          aria-label="Send message"
          className="shrink-0 px-3"
        >
          <SendHorizontal size={18} strokeWidth={2.2} />
        </Button>
      </div>
    </footer>
  )
}
