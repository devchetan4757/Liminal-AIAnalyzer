import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyzeHash,
  analyzeUpload,
  checkSandboxStatus,
  getConversation,
  sendMessage,
} from '../api/client'
import { sha256OfFile } from '../utils/hash'

let idCounter = 0
const nextId = () => `m-${++idCounter}`

const POLL_INTERVAL_MS = 15000 // ~15s between checks, stays well under VT's free 4/min limit

const STATUS_LABELS = {
  queued: 'Queued for sandbox analysis…',
  'in progress': 'Detonating in sandbox, analyzing behavior…',
}

// Server ConversationMessage rows use role "user"/"assistant" and don't
// carry a client-side `id` -- map them into the same shape pushMessage()
// already produces so MessageBubble doesn't need to know the difference
// between a live turn and a hydrated one.
function fromServerMessage(m) {
  return {
    id: m.id,
    role: m.role === 'assistant' ? 'bot' : 'user',
    type: m.type === 'file' ? 'file' : m.type,
    content: m.content,
    indicator: m.indicator,
    indicator_type: m.indicator_type,
    verdict: m.verdict,
    score: m.score,
    headline: m.headline,
    findings: m.findings,
    recommendation: m.recommendation,
    sources: m.sources,
    found: m.found,
  }
}

// conversationId is null for a brand-new chat that hasn't been saved yet.
// The backend mints a real id the moment the *first* message/upload lands
// (see _get_or_create_conversation in chat.py / analyze.py) and hands it
// back as `conversation_id` on every response. onConversationCreated lets
// the parent (which owns the conversationId piece of state, and the
// sidebar list) find out about that id the instant it exists, instead of
// only learning about it on the next hard refresh.
export function useChat(conversationId, onConversationCreated) {
  const [messages, setMessages] = useState([])
  const [pendingFile, setPendingFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hydrating, setHydrating] = useState(false)

  const pollTimeoutRef = useRef(null)

  // Set right before we tell the parent about a freshly-minted
  // conversation id. The hydration effect below checks this so it
  // doesn't immediately re-fetch (and blow away/duplicate) the messages
  // we already have locally, and doesn't cancel a poll timer we might be
  // setting up in the very same tick (see confirmUpload).
  const skipNextHydrationRef = useRef(false)

  const pushMessage = useCallback((msg) => {
    const id = nextId()
    setMessages((prev) => [...prev, { id, ...msg }])
    return id
  }, [])

  const updateMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    )
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  // If a response just told us about a conversation id we didn't know
  // about yet (i.e. we were still null - a brand-new, unsaved chat),
  // bubble it up so ChatWindow/ConversationSidebar can adopt it right
  // away instead of only picking it up after a reload.
  const reportConversationId = useCallback(
    (result) => {
      if (!conversationId && result?.conversation_id && onConversationCreated) {
        skipNextHydrationRef.current = true
        onConversationCreated(result.conversation_id)
      }
    },
    [conversationId, onConversationCreated],
  )

  // Stop any in-flight polling if the component unmounts
  useEffect(() => stopPolling, [stopPolling])

  // Whenever the active conversation changes (New Chat, or picking one
  // from the sidebar), load its saved transcript instead of starting
  // blank. A brand-new conversation has no messages yet, so this just
  // resolves to an empty list for it.
  useEffect(() => {
    // We already have the correct local state for this id (we just
    // learned it from our own request's response) - don't stomp on it,
    // and don't touch polling/pendingFile that this same turn may still
    // be setting up.
    if (skipNextHydrationRef.current) {
      skipNextHydrationRef.current = false
      return
    }

    stopPolling()
    setPendingFile(null)

    if (!conversationId) {
      setMessages([])
      return
    }

    let cancelled = false
    setHydrating(true)
    getConversation(conversationId)
      .then((convo) => {
        if (cancelled) return
        setMessages((convo.messages || []).map(fromServerMessage))
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })

    return () => {
      cancelled = true
    }
  }, [conversationId, stopPolling])

  const pollSandboxStatus = useCallback(
    (messageId, targetConversationId) => {
      const tick = async () => {
        try {
          const result = await checkSandboxStatus(targetConversationId)

          if (result.type === 'sandbox_status') {
            const label = STATUS_LABELS[result.status] || `Status: ${result.status}…`
            updateMessage(messageId, { type: 'text', content: label, sandboxPending: true })
            pollTimeoutRef.current = setTimeout(tick, POLL_INTERVAL_MS)
            return
          }

          // Done -- result is either a full "analysis" card or a "text" fallback
          updateMessage(messageId, { ...result, sandboxPending: false })
        } catch (err) {
          updateMessage(messageId, {
            type: 'text',
            content: `Sandbox check failed: ${err.message}`,
            sandboxPending: false,
          })
        }
      }
      tick()
    },
    [updateMessage],
  )

  const submitText = useCallback(
    async (text) => {
      if (!text.trim()) return
      pushMessage({ role: 'user', type: 'text', content: text })
      setLoading(true)
      try {
        const result = await sendMessage(text, conversationId)
        reportConversationId(result)
        pushMessage({ role: 'bot', ...result })
      } catch (err) {
        pushMessage({
          role: 'bot',
          type: 'text',
          content: `Could not reach the backend: ${err.message}`,
        })
      } finally {
        setLoading(false)
      }
    },
    [pushMessage, conversationId, reportConversationId],
  )

  const submitFile = useCallback(
    async (file) => {
      pushMessage({ role: 'user', type: 'file', content: file.name })
      setLoading(true)
      try {
        const hash = await sha256OfFile(file)
        const result = await analyzeHash({ hash, filename: file.name, size: file.size }, conversationId)
        reportConversationId(result)
        if (result.found === false) {
          setPendingFile(file)
          pushMessage({
            role: 'bot',
            type: 'text',
            content: `This file's hash (${hash.slice(0, 16)}…) wasn't found in any free database.`,
            offerUpload: true,
          })
        } else {
          pushMessage({ role: 'bot', ...result })
        }
      } catch (err) {
        pushMessage({
          role: 'bot',
          type: 'text',
          content: `Could not hash or look up that file: ${err.message}`,
        })
      } finally {
        setLoading(false)
      }
    },
    [pushMessage, conversationId, reportConversationId],
  )

  const confirmUpload = useCallback(async () => {
    if (!pendingFile) return
    const file = pendingFile
    setPendingFile(null)
    setLoading(true)
    try {
      const result = await analyzeUpload(file, conversationId)
      reportConversationId(result)

      if (result.type === 'sandbox_pending') {
        const messageId = pushMessage({
          role: 'bot',
          type: 'text',
          content: result.content,
          sandboxPending: true,
        })
        setLoading(false)
        // Use the id the backend just handed back, not the (possibly
        // still-null) conversationId this render closed over -- this may
        // be the very first message of a brand-new chat.
        pollTimeoutRef.current = setTimeout(
          () => pollSandboxStatus(messageId, result.conversation_id),
          POLL_INTERVAL_MS,
        )
        return
      }

      pushMessage({ role: 'bot', ...result })
    } catch (err) {
      pushMessage({
        role: 'bot',
        type: 'text',
        content: `Upload scan failed: ${err.message}`,
      })
    } finally {
      setLoading(false)
    }
  }, [pendingFile, pushMessage, pollSandboxStatus, conversationId, reportConversationId])

  return {
    messages,
    loading,
    hydrating,
    submitText,
    submitFile,
    confirmUpload,
    hasPendingFile: !!pendingFile,
  }
}
