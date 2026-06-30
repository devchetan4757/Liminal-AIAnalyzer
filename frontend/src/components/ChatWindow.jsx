import Header from './Header'
import MessageInput from './MessageInput'
import MessageList from './MessageList'
import { useChat } from '../hooks/useChat'

export default function ChatWindow() {
  const { messages, loading, submitText, submitFile, confirmUpload, clearChat } = useChat()

  return (
    <div className="chat-window">
      <Header onClearChat={clearChat} />
      <MessageList messages={messages} onConfirmUpload={confirmUpload} />
      {loading && <div className="typing-indicator">Analyzing…</div>}
      <MessageInput onSendText={submitText} onSendFile={submitFile} disabled={loading} />
    </div>
  )
}
