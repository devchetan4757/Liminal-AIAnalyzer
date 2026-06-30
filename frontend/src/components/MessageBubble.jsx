import { Loader2, Paperclip, ShieldHalf } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnalysisCard from "./AnalysisCard";
import UploadPrompt from "./UploadPrompt";

export default function MessageBubble({ message, onConfirmUpload }) {
  const { role, type } = message;
  const isBot = role === "bot";

  let content;

  if (type === "analysis") {
    content = (
      <div className={`bubble bubble--${role}`}>
        <AnalysisCard data={message} />
      </div>
    );
  } else if (type === "file") {
    content = (
      <div className={`bubble bubble--${role} bubble--file`}>
        <Paperclip size={14} />
        {message.content}
      </div>
    );
  } else {
    content = (
      <div className={`bubble bubble--${role}`}>
        {message.sandboxPending && (
          <Loader2 size={14} className="bubble__spinner" />
        )}

        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content}
        </ReactMarkdown>

        {message.offerUpload && (
          <UploadPrompt onConfirm={onConfirmUpload} />
        )}
      </div>
    );
  }

  return (
    <div className={`message-row message-row--${role}`}>
      {isBot && (
        <span className="bot-avatar">
          <ShieldHalf size={15} />
        </span>
      )}
      {content}
    </div>
  );
}
