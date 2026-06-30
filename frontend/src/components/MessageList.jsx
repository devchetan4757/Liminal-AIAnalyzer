import MessageBubble from './MessageBubble'
import { Sparkles } from 'lucide-react'

export default function MessageList({ messages, onConfirmUpload }) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={28} strokeWidth={2} />
        </div>

        <h2 className="text-base font-semibold text-text">
          How can I help today?
        </h2>

        <p className="mt-1 max-w-sm text-sm text-text-dim">
          Ask a question, upload a file, paste a URL, IP address,
          domain, or hash to begin.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onConfirmUpload={onConfirmUpload}
        />
      ))}
    </div>
  )
}
