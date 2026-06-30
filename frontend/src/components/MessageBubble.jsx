import { Loader2, Paperclip, ShieldHalf } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AnalysisCard from './AnalysisCard'
import UploadPrompt from './UploadPrompt'

const bubbleBase =
  'max-w-[75%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed'

const bubbleByRole = {
  bot: 'bg-bg-raised border border-border text-text',
  user: 'bg-accent text-bg ml-auto',
}

export default function MessageBubble({ message, onConfirmUpload }) {
  const { role, type } = message
  const isBot = role === 'bot'

  let content

  if (type === 'analysis') {
    content = (
      <div className={`${bubbleByRole[role]} max-w-[85%] p-0 overflow-hidden`}>
        <AnalysisCard data={message} />
      </div>
    )
  } else if (type === 'file') {
    content = (
      <div className={`${bubbleBase} ${bubbleByRole[role]} flex items-center gap-2 font-mono`}>
        <Paperclip size={14} />
        {message.content}
      </div>
    )
  } else {
    content = (
      <div className={`${bubbleBase} ${bubbleByRole[role]}`}>
        {message.sandboxPending && (
          <Loader2 size={14} className="mb-1 animate-spin text-accent" />
        )}

        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:bg-bg-inset">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {message.offerUpload && (
          <UploadPrompt onConfirm={onConfirmUpload} />
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 ${isBot ? '' : 'flex-row-reverse'}`}>
      {isBot && (
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <ShieldHalf size={14} />
        </span>
      )}
      {content}
    </div>
  )
}
