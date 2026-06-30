import MessageBubble from "./MessageBubble";
import { Sparkles } from "lucide-react";

export default function MessageList({
  messages,
  onConfirmUpload,
}) {
  if (messages.length === 0) {
    return (
      <div className="message-list message-list--empty">
        <div className="message-list__empty">
          <div className="message-list__empty-icon">
            <Sparkles size={34} strokeWidth={2} />
          </div>

          <h2 className="message-list__empty-title">
            How can I help today?
          </h2>

          <p className="message-list__empty-text">
            Ask a question, upload a file, paste a URL, IP address,
            domain, or hash to begin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onConfirmUpload={onConfirmUpload}
        />
      ))}
    </div>
  );
}
