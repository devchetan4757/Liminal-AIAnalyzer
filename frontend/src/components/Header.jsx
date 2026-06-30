import { Bot, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'

export default function Header({ onClearChat }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 bg-bg-raised">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Bot size={22} strokeWidth={2} />
        </div>

        <div>
          <h1 className="text-sm font-semibold text-text leading-tight">
            Liminal
          </h1>
          <p className="text-xs text-text-faint leading-tight">
            Your intelligent AI assistant
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearChat}
        title="Clear conversation"
        aria-label="Clear conversation"
      >
        <Trash2 size={16} />
        <span className="hidden sm:inline">Clear Chat</span>
      </Button>
    </header>
  )
}
