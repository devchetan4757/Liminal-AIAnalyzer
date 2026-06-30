import Header from './Header'
import MessageInput from './MessageInput'
import MessageList from './MessageList'
import { useChat } from '../hooks/useChat'

export default function ChatWindow() {
  const { messages, loading, submitText, submitFile, confirmUpload, clearChat } = useChat()

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <Header onClearChat={clearChat} />

      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} onConfirmUpload={confirmUpload} />
      </div>

      {loading && (
        <div className="px-4 pb-1 text-xs text-text-faint font-mono">
          Analyzing…
        </div>
      )}

      <MessageInput onSendText={submitText} onSendFile={submitFile} disabled={loading} />
    </div>
  )
}
