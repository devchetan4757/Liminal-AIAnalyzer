import { useState } from 'react'
import Header from './Header'
import MessageInput from './MessageInput'
import MessageList from './MessageList'
import ConversationSidebar from './ConversationSidebar'
import { useChat } from '../hooks/useChat'

export default function ChatWindow() {
  // null = no conversation created yet; chat.py mints one implicitly on
  // the first message. Picking a conversation from the sidebar sets this.
  const [conversationId, setConversationId] = useState(null)

  const {
    messages,
    loading,
    hydrating,
    submitText,
    submitFile,
    confirmUpload,
    clearChat,
  } = useChat(conversationId, setConversationId)

  const handleClearChat = () => {
    clearChat?.()
    setConversationId(null)
  }

  return (
    <div className="flex h-full w-full bg-bg">
      <ConversationSidebar
        activeId={conversationId}
        onSelect={setConversationId}
        onCreated={setConversationId}
      />

      <div className="flex h-full flex-1 flex-col">
        <Header onClearChat={handleClearChat} />

        <div className="flex-1 overflow-y-auto">
          {hydrating ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-raised px-5 py-4 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-accent"></span>
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-accent"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-accent"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-text">
                    Loading conversation...
                  </p>
                  <p className="text-xs text-text-faint">
                    Restoring previous messages
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <MessageList
                messages={messages}
                onConfirmUpload={confirmUpload}
              />

              {loading && (
                <div className="px-4 py-4">
                  <div className="inline-flex max-w-[75%] items-center gap-3 rounded-2xl rounded-bl-md border border-border bg-bg-raised px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-accent"></span>
                      <span
                        className="h-2 w-2 animate-bounce rounded-full bg-accent"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="h-2 w-2 animate-bounce rounded-full bg-accent"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>

                    <div>
                      <p className="text-sm font-medium text-text">
                        Liminal AI is thinking...
                      </p>
                      <p className="text-xs text-text-faint">
                        Analyzing your request
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <MessageInput
          onSendText={submitText}
          onSendFile={submitFile}
          disabled={loading}
        />
      </div>
    </div>
  )
}
